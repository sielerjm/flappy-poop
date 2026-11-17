import { GAME_HEIGHT, FIELD, TUNING as T, LEVELS, LEVEL_COLORS, BACKGROUND, TEST_MODE, EDUCATION, LEADERBOARD } from '../config.js';
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
  pipeClearance,
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
  chromeShown,
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
  bracketButtonLayout,
  eduBreakLayout,
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
  floatY,
  superQReward,
  superQPenalty,
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
  nextEduStartLevel,
  LAST_UPDATED,
  padIntent,
  fallStarted,
  levelPipes,
  storedLocale,
  PERF_TAGS,
} from '../logic.js';
import { t, pauseBannerText, levelBannerText, levelLabel, initialLocale, isLocale, profileButtonText, countText, versusName, countLines } from '../i18n.js';
import { loadLocal, saveLocal, ensureId, recordScore, mergeBoardBests, newId, TOILET_EMOJI } from '../save.js';
import { createRunStats, stubRow } from '../runStats.js';
import { VERSION as APP_VERSION } from '../logic.js';
import { browserStorage } from '../store.js';
import { runDeltas, evaluate, bestFacts, levelCloseShave, winsInWindow, daysBetween, nextDrawStreak, FOUR_OF_A_KIND, EDU_ACHIEVEMENTS, eduRunFacts } from '../achievements.js';
import { unlock, attachGame, setMuted, isMuted, sfx } from '../sound.js';
import { createTray } from '../ui/tray.js';
import { createFocus } from '../ui/focus.js';
import { activeOverlays, OVERLAY_SCENES } from '../ui/overlayStack.js';
import { createGlow, createRectGlow } from '../ui/glow.js';
import { perfMark, perfSteps, perfRunStart } from '../ui/perfMeter.js';
import { createFinishTexture } from '../ui/finish.js';
import { createLightTexture } from '../ui/pipeShade.js';
import { createLevelBar } from '../ui/levelBar.js';
import { enrolResearch, submitResearchEvents, deleteResearch, createEduShareStore, shareEducation, renameEducation, unshareEducation, submitEducationGrades, fetchEducationBoard, createSubmitStore, createMergeStore, createRenameStore, createTournamentQueue, createDailyStore, createDailyQueue, createRunQueue, submitRuns, waitsForRun, submitDailyScore, fetchDailyBoard, submitPlans, submitScore, submitTournament, checkNameAvailable, mergePlayers, fetchPlayerName, fetchRank, nameAction, createCareerStore, createStreakStore, submitCounters, claimAchievements, fetchPlayerStats } from '../leaderboard.js';
import { createButton } from '../ui/button.js';
import { createToggle } from '../ui/toggle.js';
import { createCoinText } from '../ui/coinText.js';
import { createCountLine } from '../ui/countLine.js';
import { createInfoCard } from '../ui/infoCard.js';
import { openSavePanel, isSavePanelOpen, showAdoptedName, showBoardScores } from '../ui/savePanel.js';
import { isTournamentPanelOpen, tournamentPadAction } from '../ui/tournamentPanel.js';
import { openEduDataPanel, isEduDataPanelOpen } from '../ui/eduDataPanel.js';
import { openEduIntroPanel, closeEduIntroPanel, isEduIntroPanelOpen, eduIntroPadAction } from '../ui/eduIntroPanel.js';
import { answerEvent, createConsentStore, createResearchQueue } from '../research.js';
import { bindPad } from '../input/pad.js';
import { keyGroup, sameDevice, catchUpTier, catchUpDraws, versusAvailable, ghostPlacement, rivalMarker, respawnPose, respawnBlinkStart, courseDistance, VERSUS_EMOJI } from '../versus.js';
import { createEduStore, countersAfterRun, dueCount, cardCounts, masteryByDeck, pickCard, shuffleOptions, gradeFor, schedule, eduShopPrices, reviveStart, reviveStep, reviveSettled, newTally, tallyAnswer, EDUCATION_EMOJI, localDayKey, studyStreakNow, pickSuperCard, paidOn, buriedIdsOn, skipUntil, boardRecord, educationBackup, readEducationBackup, restoredSettings } from '../education.js';

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
/** The game registry's flag: this page load has asked the 📚 row for its round (drainEduShare's probe). */
const EDU_ROUND_PROBED = 'eduRoundProbed';

// The press behind the input being handled right now (plan 30): set around an input listener's
// synchronous work and read by doFlap, so each flap of a run's summary is counted by what stood
// behind it (pressFacts). One object, reused; never exported; both halves of a match share it.
// Counts only: nothing here decides anything about a press.
const STAMP = { active: false, trusted: false, recent: false, ts: -1 };
const RECENT_MS = 1000; // Phaser hands a key over on its next step, which a long frame can hold back; a replayed old event is far older
let lastFlapTs = -1;
// The browser's own timeStamp getter, taken as this module loads: it answers only for a real event
// (anything else throws), so a plain object or a copy dressed up as an event is no press.
const EVENT_TS = globalThis.Event ? Object.getOwnPropertyDescriptor(globalThis.Event.prototype, 'timeStamp')?.get ?? null : null;

/**
 * What a press's event says: { trusted (a real browser event the browser marks as a person's: its
 * isTrusted cannot be set on a real event), recent (made within RECENT_MS of `now`), ts (its
 * timeStamp, or -1) }. A pad press (no event) counts as trusted and recent. Exported for its tests.
 */
export function pressFacts(event, kind, now) {
  if (kind === 'pad') return { trusted: true, recent: true, ts: -1 };
  let ts = -1;
  try {
    ts = EVENT_TS && event ? EVENT_TS.call(event) : -1;
  } catch {
    ts = -1;
  }
  if (typeof ts !== 'number' || !(ts >= 0)) return { trusted: false, recent: false, ts: -1 };
  return { trusted: event.isTrusted === true, recent: now - ts >= -1 && now - ts < RECENT_MS, ts };
}

/** Run fn with STAMP describing `event` (null for a pad press). A nested press puts the outer one back. */
function withInput(event, kind, fn) {
  const was = [STAMP.active, STAMP.trusted, STAMP.recent, STAMP.ts];
  const facts = pressFacts(event, kind, globalThis.performance?.now?.() ?? 0);
  STAMP.active = true;
  STAMP.trusted = facts.trusted;
  STAMP.recent = facts.recent;
  STAMP.ts = facts.ts;
  try {
    return fn();
  } finally {
    [STAMP.active, STAMP.trusted, STAMP.recent, STAMP.ts] = was;
  }
}

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
    this.runStats = createRunStats(); // this run's summary (plan 30), kept while runStatsOn
    this.runStatsOn = false;
    this.flapInfo = { now: 0, applied: false, internal: false, pressed: false, trusted: false, fresh: false, lip: null }; // reused per flap
    this.runQueue = createRunQueue();
    // Every random draw of the run comes from the course (createCourse): one stream in single
    // player, a shared per-pair course in a match so both halves get the same pipes and pickups.
    // A match rolls its mystery draws from a stream of its own per player (rngDraw), so what a
    // box gives is each player's own luck and never shifts the shared course.
    const seed = this.match ? this.match.seed : Date.now() & 0xffffffff;
    this.course = createCourse(seed, this.tune, { shared: Boolean(this.match) });
    this.rngDraw = this.match ? createRng((Date.now() ^ (this.player * 0x9e3779b1)) & 0xffffffff) : null;
    this.distance = 0; // where this half is on the course, in px: advanced by the scroll, re-anchored at every re-fill (rebaseDistance); the other half's ghost is placed by the difference
    this.score = 0;
    this.best = createBestStore(browserStorage(), T.bestKey);
    this.settings = createSettingsStore(browserStorage(), T.settingsKey);
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
    this.careerStore = createCareerStore(); // lifetime counters and achievements (plan 08): counted at endRun, sent by syncLeaderboard
    this.streakStore = createStreakStore(); // the Singleplayer and Daily Dump day streaks (plan 34): this device's only, never sent
    // Education mode (📚, plan 21; for everyone since plan 28): the 📚 switch on the ready screen
    // (toggleEducation), remembered in the settings store, offered while EDUCATION.enabled
    // (educationAvailable). The cards' scheduler state lives in eduStore. runIsEducation latches per run
    // like runIsTest.
    const eduSettings = this.settings.load();
    this.educationOn = eduSettings.education;
    this.eduStore = createEduStore(browserStorage());
    this.eduShare = createEduShareStore(); // the 📚 board (plan 21): whether this player shares their grades, and what the board already has (drainEduShare)
    // The tester pilot (plan 21): this device's consent (none unless the tester joined in the
    // Education data panel) and the answer events on their way to the server (drainResearch).
    this.consentStore = createConsentStore();
    this.researchQueue = createResearchQueue();
    this.runIsEducation = false;
    this.runQuiz = newTally(); // this run's quiz answers (in all and per level) and revives (start() resets it)
    this.quizOpen = false; // the Quiz scene is up (openQuiz → onQuizClosed)
    // An education crash (plan 21): the respawn holds after the tumble ('quiz') while the revive quiz
    // runs; revive is reviveStep's state, reviveLost what the crash took; respawnFilled says the
    // field was refilled under the quiz (prepareRevive), so endRespawn does not refill it again.
    this.respawnHold = null;
    this.respawnFilled = false;
    this.revive = null;
    this.reviveLost = null;
    this.runBadges = []; // the achievements the last run unlocked, for Over
    // The Daily Dump run (startDaily → start): { day, level, startPipes, playerId } while one runs, else null.
    // runIsDaily latches per run like runIsTest; dailyNext carries startDaily's day through the launch slide.
    this.runIsDaily = false;
    this.daily = null;
    this.dailyNext = null;
    this.renameStore = createRenameStore(); // a rename typed on this device, until a post carries it to the board
    this.boardNameTaken = false; // the last sync was refused because another player holds this username
    this.boardBestsFor = null; // the id whose board scores this page already pulled (pullBoardBests)
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
    this.state = 'ready'; // 'ready' | 'playing' | 'paused' | 'respawn' | 'dead' ('respawn': a match half between a crash and its restart, or an education run from a crash through its revive quiz)
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
    this.scaredMs = 0; // ms left of the near-miss face (tickScared)
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
    this.readyBoxes = null;
    this.layoutReady(); // centred boxes land on W / 2; the ? at the column's right edge
    this.launching = false;
    // Toilet mode: session-only (registry survives scene.restart, not a reload).
    this.toilet = Boolean(this.registry.get('toilet'));
    // Two-player mode (the 👥 toggle under the toilet one): session-only too; the start tap then goes to Versus.
    this.versusOn = Boolean(this.registry.get('versus'));
    // 📚 is remembered on the device and 👥 only in this tab, so another tab can leave both on here.
    this.reconcileSwitches();
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
    this.readyUiShown = true; // setReadyUiVisible's last word: the switches rebuilt by refreshReadySwitches follow it
    this.toiletToggle = this.versusToggle = this.educationToggle = this.eduDueText = this.eduStreakText = null; // a restart destroyed the last ones
    this.buildReadySwitches();
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
    // Depth 30, as the tray: it also shows in a pause and a level break (plan 28, 4.3), above their shade (25).
    this.howToBtn = createButton(this, this.readyBoxes.howto, '?', { ...TEXT_STYLE, fontSize: '52px', color: '#f8a0c8' }, { depth: 30 });
    this.howToBtn.pulse(this.isHowToPromptDue()); // breathes with its halo until this build's How to play is seen
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
      // The Daily Dump streak, a small number at the circle's bottom right (plan 34: refreshStreakMarks).
      this.dailyStreakText = this.streakMark(b.x + T.streakMarkPx.dx, b.y + T.streakMarkPx.dy);
    }
    this.refreshDailyPrompt();
    this.refreshStreakMarks();
    // Once per page load and day: a user code that already played today on another device stops the glow here too.
    if (!this.match && this.registry.get('dailyCheckedDay') !== utcDayKey()) {
      this.registry.set('dailyCheckedDay', utcDayKey());
      this.checkDailyOnServer();
    }
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
    // A won education run left waiting by its game-over panel (plan 26) is recorded now: the panel was
    // left (Home, Play again), or the page was closed on it. The sync that follows sends its grade.
    const eduRecorded = this.finishPendingEducation();
    if (!this.match && !bootSynced) {
      bootSynced = true;
      this.creditCareer(); // badges the saved bests already earn (unnamed and offline players too)
      this.syncLeaderboard(); // fire and forget: picks up the board's name (a rename made on another device)
    } else if (eduRecorded && !this.match) this.syncLeaderboard();
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
    // a smaller line under it (levelSubHint): a match's "Tap again to un-ready" under "Ready!", or, at
    // an education gate after a refused tap, what holds the break (plan 26, A2).
    this.levelHintGlow = this.add
      .text(W / 2, GAME_HEIGHT * 0.4 + 72, '', { ...TEXT_STYLE, fontSize: '36px', stroke: '#ffffff', strokeThickness: 10 })
      .setShadow(0, 0, '#ffffff', 18, true, true)
      .setOrigin(0.5)
      .setDepth(25.9)
      .setVisible(false);
    this.hintPulseMs = 0;
    this.levelSubHint = this.add
      .text(W / 2, GAME_HEIGHT * 0.4 + 72 + 50, '', { ...TEXT_STYLE, fontSize: '26px', color: '#c9b8dc', strokeThickness: 8, align: 'center', wordWrap: { width: this.col.width - 64, useAdvancedWrap: true } })
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
    this.shopButtonBox = shopButtonLayout(this.col.width, GAME_HEIGHT, T, this.col.x, { match: Boolean(this.match) });
    this.shopBoxes = shopLayout(this.col.width, GAME_HEIGHT, T, this.col.x);
    this.shopButton = createButton(this, this.shopButtonBox, t(this.locale, 'shopPill'), { ...TEXT_STYLE, fontSize: '40px' }, { depth: 27, icon: { key: 'coin', px: 48 } }).setVisible(false);
    // A tournament race's 🏅 Bracket pill under the 💰: once both halves are in their level break
    // (Versus.bothInBreak) it opens the bracket read-only (Versus.openPeek); it never readies the half.
    this.bracketButtonBox = this.match?.tournament ? bracketButtonLayout(this.col.width, GAME_HEIGHT, T, this.col.x) : null;
    this.bracketButton = this.bracketButtonBox ? createButton(this, this.bracketButtonBox, t(this.locale, 'tournamentBracketPill'), { ...TEXT_STYLE, fontSize: '36px', color: '#ffd700' }, { depth: 27 }).setVisible(false) : null;
    // An education run's 📚 Review pill (plan 21; plan 25 named it), in the middle of the break's row
    // (eduBreakLayout; single player only). It opens the quiz on the segment just cleared
    // (chromeIntent's 'quiz'). Under it, a line of its own says what is waiting there, as Anki does:
    // new cards in blue, missed cards in red, reviews due in green (quizCountLine;
    // refreshShopButton; none in a test run, whose quizzes ignore the schedule). A tap on the line
    // says what the numbers mean (toggleBreakCounts). eduBreakLayout also places Quit.
    this.eduBreakBoxes = this.match ? null : eduBreakLayout(this.col.width, GAME_HEIGHT, T, this.col.x);
    this.quizButtonBox = this.eduBreakBoxes?.review ?? null;
    this.quizCountsBox = this.eduBreakBoxes?.chip ?? null; // the chip under Review: the numbers' tap box and ring item (plan 26, A2)
    this.quizButton = this.quizButtonBox ? createButton(this, this.quizButtonBox, `${EDUCATION_EMOJI} ${t(this.locale, 'reviewPill')}`, { ...TEXT_STYLE, fontSize: '36px', color: '#f8a0c8' }, { depth: 27 }).setVisible(false) : null;
    // Quit beside Review (plan 25, B8; plan 26, Michael's sketch: refreshQuizButton). Skip ▸ (levels) is gone since plan 26's A2.
    const sideStyle = { ...TEXT_STYLE, fontSize: '30px', color: '#f8a0c8' };
    // The level choice, [◀] LV n [▶], on ⏸'s row, centred (plan 26, A2; plan 28, 1.1: refreshLevelPickUi).
    const eb = this.eduBreakBoxes;
    this.levelPickDown = eb ? createButton(this, eb.levelDown, '◀', sideStyle, { depth: 27 }).setVisible(false) : null;
    this.levelPickUp = eb ? createButton(this, eb.levelUp, '▶', sideStyle, { depth: 27 }).setVisible(false) : null;
    this.levelPickLabel = eb ? this.add.text(eb.levelLabel.x, eb.levelLabel.y, '', { ...TEXT_STYLE, fontSize: '36px' }).setOrigin(0.5).setDepth(27).setVisible(false) : null;
    this.breakQuitButton = this.eduBreakBoxes ? createButton(this, this.eduBreakBoxes.quit, t(this.locale, 'breakQuit'), sideStyle, { depth: 27 }).setVisible(false) : null;
    // The numbers on a dark rounded chip under Review, inside its width (plan 26, A2: Michael's images 2 and 9).
    const chip = this.eduBreakBoxes?.chip;
    this.quizCountChip = chip
      ? this.add.graphics().fillStyle(0x1a0b14, 0.85).fillRoundedRect(chip.x - chip.width / 2, chip.y - chip.height / 2, chip.width, chip.height, 16).lineStyle(3, 0x5a2a44, 1).strokeRoundedRect(chip.x - chip.width / 2, chip.y - chip.height / 2, chip.width, chip.height, 16).setDepth(27.5).setVisible(false)
      : null;
    const counts = this.eduBreakBoxes?.counts;
    this.quizCountLine = counts
      ? createCountLine(this, counts.x, counts.y, { style: TEXT_STYLE, px: 32, sep: '   ', depth: 28, maxWidth: counts.width }).setVisible(false)
      : null;

    // The info card of the ready screen's 📚 glyph ("Your cards": toggleEduCard) and of a level break's
    // numbers ("Waiting in this quiz": toggleBreakCounts), over everything here, the ring included.
    // Single player only, as the 📚 switch is.
    this.eduCard = this.match ? null : createInfoCard(this, { x: this.col.x + this.col.width / 2, y: GAME_HEIGHT / 2 - 40, width: 600 });

    // The tray and the controller ring belong to the chrome owner: single player, or P1 in a match (P2 has neither).
    this.tray = !this.match || this.player === 1 ? createTray(this, { muted: isMuted(), col: this.col }) : null;
    this.chromeSeen = null; // a new tray: the next syncChrome places it (plan 28, 4.3)
    this.helpShown = false;
    // Controller focus ring over the tray, in screen order; A on a ringed button runs the
    // same handleChrome(id) its tap runs. Shown by a d-pad press (onPadAction), never by touch.
    // Ready-screen extras after the tray (so the first ring lands on ⓘ): the toilet toggle and the
    // ? (How to play), both only while the ready screen is up. The user button stays off the ring
    // on purpose: the save panel needs the keyboard.
    const onReady = () => this.state === 'ready' && !this.launching && !this.match;
    this.focus = this.tray
      ? createFocus(this, T, {
          items: [
            // The bottom row only while it is in (plan 28, 4.3: chromeShown); ⏸ always.
            ...['info', 'lang', 'feedback', 'leaderboard', 'mute', 'settings', 'pause'].map((id) => ({ id, obj: this.tray.buttons[id], ...(id === 'pause' ? {} : { visible: () => this.tray.rowShown(), rect: () => this.tray.restBounds(id) }), activate: () => this.handleChrome(id) })),
            { id: 'toilet', box: this.switchBoxes.toilet, visible: onReady, activate: () => this.toggleToilet() },
            // 👥 and 📚 always have an item; it shows only while its switch is offered (refreshReadySwitches).
            { id: 'versus', box: this.switchBoxes.versus, visible: () => onReady() && Boolean(this.readyBoxes.versus), activate: () => this.toggleVersus() },
            { id: 'education', box: this.switchBoxes.education, visible: () => onReady() && Boolean(this.readyBoxes.education), activate: () => this.toggleEducation() },
            // The 📚 glyph (and its gold count): "Your cards" (toggleEduCard; plan 26, A2).
            { id: 'educationInfo', box: this.switchBoxes.educationInfo, visible: () => onReady() && Boolean(this.readyBoxes.educationInfo), activate: () => this.toggleEduCard() },
            { id: 'daily', box: this.readyBoxes.daily, visible: onReady, activate: () => this.handleChrome('daily') },
            { id: 'howto', box: this.readyBoxes.howto, visible: () => onReady() || (this.helpShown && this.state === 'paused'), activate: () => this.handleChrome('howto') },
            // The level break: the 💰 pill, then (the shop open) its ✕ and rows down the column.
            { id: 'shop', box: this.shopButtonBox, depth: 27, visible: () => this.shopButtonShown(), activate: () => this.handleChrome('shop') },
            ...(this.bracketButtonBox ? [{ id: 'bracket', box: this.bracketButtonBox, depth: 27, visible: () => this.bracketButtonShown(), activate: () => this.openBracketPeek() }] : []),
            ...(this.quizButtonBox ? [{ id: 'quiz', box: this.quizButtonBox, depth: 27, visible: () => this.quizButtonShown(), activate: () => this.handleChrome('quiz') }] : []),
            ...(this.quizCountsBox ? [{ id: 'quizCounts', box: this.quizCountsBox, depth: 27, visible: () => this.quizButtonShown() && this.quizCountLine.visible, activate: () => this.toggleBreakCounts() }] : []),
            ...(this.eduBreakBoxes ? [{ id: 'breakQuit', box: this.eduBreakBoxes.quit, depth: 27, visible: () => this.quizButtonShown(), activate: () => this.breakQuitTap() }] : []),
            ...(this.eduBreakBoxes ? [{ id: 'levelDown', box: this.eduBreakBoxes.levelDown, depth: 27, visible: () => this.levelPickShown(), activate: () => this.stepBreakLevel(-1) }] : []),
            ...(this.eduBreakBoxes ? [{ id: 'levelUp', box: this.eduBreakBoxes.levelUp, depth: 27, visible: () => this.levelPickShown(), activate: () => this.stepBreakLevel(1) }] : []),
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
      const kind = pointer.wasTouch ? 'touch' : 'mouse';
      this.statCall('press', kind, this.statNow(), pointer.x, pointer.y, this.fieldW, GAME_HEIGHT);
      withInput(pointer.event, kind, () => {
        const p = this.localPointer(pointer);
        if (p) this.flap(p);
      });
    });
    this.input.on('pointerup', () => this.statCall('release', this.statNow()));
    const keys = !this.match || this.player === 1 ? this.input.keyboard : null;
    const flapKey = (event) => {
      this.statCall('press', 'key', this.statNow());
      return withInput(event, 'key', () => !this.match && this.flap());
    };
    keys?.on('keydown-SPACE', flapKey);
    keys?.on('keydown-UP', flapKey);
    keys?.on('keyup-SPACE', () => this.statCall('release', this.statNow()));
    keys?.on('keyup-UP', () => this.statCall('release', this.statNow()));
    keys?.on('keydown-M', () => this.handleChrome('mute'));
    keys?.on('keydown-P', () => this.handleChrome('pause'));
    keys?.on('keydown-ESC', () => this.handleChrome('esc'));
    keys?.on('keydown-S', () => this.handleChrome('settings'));
    keys?.on('keydown-I', () => this.handleChrome('info'));
    keys?.on('keydown-L', () => this.handleChrome('lang'));
    keys?.on('keydown-F', () => this.handleChrome('feedback'));
    keys?.on('keydown-T', () => this.handleChrome('leaderboard'));
    keys?.on('keydown-B', () => !this.match && this.activatePower()); // no-op unless the bean power is charged
    keys?.on('keydown', (event) => withInput(event, 'key', () => this.onVersusKey(event?.code))); // a match: each key group is one player's flap / power
    // Gamepad: one binding for the whole game (overlays, Over and the other half of a match run
    // on top of or beside this scene, which is never paused); onPadAction routes each press to
    // whichever scene is on top, and in a match to the half that claimed the pad.
    this.pad = !this.match || this.player === 1
      ? bindPad(this, (action, padIndex) => {
          if (action === 'select' || action === 'power') this.statCall('press', 'pad', this.statNow());
          return withInput(null, 'pad', () => this.onPadAction(action, padIndex));
        }, T)
      : null;

    this.onHidden = () => {
      if (typeof document !== 'undefined' && document.hidden) this.autoPause();
    };
    this.onBlur = () => this.autoPause();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onHidden);
    this.game.events.on('blur', this.onBlur);
    this.events.once('shutdown', () => {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onHidden);
      this.game.events.off('blur', this.onBlur);
      // The 📚 popup belongs to this scene's ready screen (a restart takes it down), closed without a call back
      // into this scene: its texts are destroyed by now, and redrawing a changed 📚 count would throw (AUD-063).
      if (!this.match) closeEduIntroPanel({ notify: false });
      this.pad?.destroy();
      this.pad = null;
      this.focus?.destroy();
      this.focus = null;
      this.shop = null; // its objects die with the scene
      this.shopOpen = false;
      this.reelSpin = null;
      this.stopFartSound();
    });
    // Over's Play again: a one-shot registry flag (not restart data, which Phaser would keep for
    // every later restart), cleared here before the run starts.
    if (this.registry.get('playAgain')) {
      this.registry.set('playAgain', false);
      if (!this.match) this.launch({ solo: true });
    }
    this.openPendingInvite(); // an invite link (plan 28, 2.4)
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
    return this.state === 'ready' && !this.launching && !this.chromeArgs('tap').overlay && !this.scene.isActive('Over') && !isSavePanelOpen() && !isEduDataPanelOpen() && !isEduIntroPanelOpen();
  }

  /**
   * Start tap: hide the ready UI, slide the poop from its ready spot to the
   * play position, then start(). Extra taps during the slide are ignored.
   */
  /**
   * The start tap: the poop slides into place, then the run starts with a flap. `hold` (a match's
   * countdown): it slides and waits there; the Versus GO starts it (startRace). With 📚 on, a start
   * from the ready screen (a tap, Space, ↑, the pad's A: all arrive here with no options) opens the
   * 📚 popup instead and nothing starts (plan 26, A2: Michael asked); its Play starts the run
   * (startFromEduIntro: `intro` false). Play again (`solo`), a Daily Dump and a match half go
   * straight in, and a popup that cannot open never blocks the run.
   */
  launch({ hold = false, daily = false, solo = false, intro = true } = {}) {
    if (this.launching || this.state !== 'ready') return;
    // Play again (solo) and a Daily Dump are one-player runs whatever the 👥 toggle says.
    if (!daily && !solo && this.versusOn && this.versusOffered()) {
      // Two-player mode: the Versus scene takes over (it stops this scene and launches the halves).
      this.focus?.hide();
      this.scene.start('Versus', { match: null });
      return;
    }
    if (intro && !hold && !daily && !solo && this.educationOn && this.educationOffered()) {
      if (isEduIntroPanelOpen() || this.openEduIntro()) return;
    }
    this.launching = true;
    this.eduCard?.hide(); // "Your cards" never rides into a run
    perfRunStart(); // ?perf: the meter's run totals start with this run
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
        this.doFlap({ internal: true });
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
    this.doFlap({ internal: true });
    this.armStartBoost();
    if (this.chromeArgs('tap').overlay) this.pauseRun();
  }

  setReadyUiVisible(visible) {
    this.readyUiShown = visible;
    this.readyTitle.setVisible(visible);
    this.toiletToggle.setVisible(visible);
    this.versusToggle?.setVisible(visible);
    this.educationToggle?.setVisible(visible);
    this.refreshEduDue();
    this.howToBtn.setVisible(visible);
    this.howToHalo.setVisible(visible && this.isHowToPromptDue());
    this.dailyBtn.setVisible(visible);
    this.dailySun.setVisible(visible);
    this.refreshDailyPrompt();
    this.refreshStreakMarks();
    this.profileBtn.setVisible(visible);
    this.profileHalo.setVisible(visible && !this.save?.name);
    this.refreshTestBadge();
  }

  start() {
    // A Daily Dump run (startDaily): the day's shared course replaces this page's random one, no 🚽.
    const daily = this.dailyNext;
    this.dailyNext = null;
    this.runIsDaily = Boolean(daily);
    this.personalBest = false; // endRun decides
    this.dailyRunDay = daily?.day ?? null; // the day on the result panel (practice too)
    this.dailySync = null;
    this.scaredMs = 0;
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
    // An education run (📚, plan 21): unlocked, the switch on, single player, never a Daily Dump.
    this.runIsEducation = !daily && this.educationOn && this.educationOffered();
    this.placeShopPill(this.runIsEducation); // in the education row, or centred (plan 26, A2)
    this.runQuiz = newTally();
    this.breakMissed = []; // a level break's cards missed and not yet answered right (plan 25): asked again, counted as missed
    this.breakNewAsked = 0; // a level break's new cards asked or skipped, and its stored due cards (plan 28, Stage 3b: breakLimits)
    this.breakDueAsked = 0;
    this.runId = null; // a pilot tester's answer events name their run (made with the run's first event)
    this.runEvents = 0;
    this.respawnHold = null;
    this.revive = null;
    this.reviveLost = null;
    // An education run may start at a level it unlocked before (plan 25: the ready screen's stepper).
    const startLevel = this.runIsTest ? this.testSettings().startLevel : this.runIsEducation ? this.eduStartLevel() : 1;
    const begin = daily ? dailyRunStart(daily.level, this.tune) : testRunStart(startLevel, this.tune);
    this.runStartLevel = begin.level; // a full run (💯, 🤓) starts at level 1 and skips nothing (plan 25)
    this.runTopLevel = begin.level; // the highest level this run has been on: the shop's and Skip's prices (plan 26, A2)
    this.breakLevelPick = null; // a level chosen at a break (plan 26, A2), applied when the break ends
    this.runSkipped = false;
    this.breakGaveUp = false; // Quit at a break while its gate holds (new cards included since plan 28, Stage 3b), or with nothing answered (plan 25; plan 26, A2)
    this.breakQuitArmedAt = null;
    this.level = begin.level;
    this.pipesPassed = begin.pipes;
    this.pipesSpawned = begin.pipes;
    this.score = begin.score;
    this.scoreText.setText(String(this.score));
    this.beanSpawned = begin.beanSpawned;
    this.refreshTestBadge();
    this.collected = { fiber: 0, probiotic: 0, postbiotic: 0, bacteria: 0, bean: 0, mystery: 0, coin: 0 };
    this.runFarts = 0; // this run's farts and super farts, for the career counters
    this.runSuperFarts = 0;
    this.runFalls = 0; // ‼️ long falls this run (fallStarted)
    this.runCloseCalls = 0; // 😢 close calls this run (tickScared)
    this.fallingNow = false;
    this.closeCallsByLevel = {}; // 💈 close calls per level this run
    this.drawStreak = null; // 🃏 the same-draw streak of this run's mystery boxes
    this.fourOfAKind = false;
    this.runCeilingHits = 0; // ☀️ (0 or 1: the ceiling ends a run)
    this.runBoxesBought = 0; // 🎰 boxes bought in the shop this run
    this.runBadges = [];
    this.mysteryPair = this.course.mysteryPair(); // the pair the guaranteed first box (early level 3) rides after
    // The purse: every run starts empty (coins last across the levels of one run only).
    this.effects.spendCoins(this.effects.coins());
    this.refreshCoinHud();
    if (daily) this.kernel = null; // no kernels, coins or shop in a Daily Dump
    else this.armKernel();
    this.superQHold = false; // a challenge question's offer or card is up (plan 34): the run is held under it
    this.superQMissed = []; // challenge cards missed this run: they cost corn only, so they never block 🤓 (eduCaughtUp)
    this.superQStill = null; // the pair after a challenge bubble: it holds still, so the bubble stays on the flight line
    this.armSuperQ();
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
      this.countDailyStreak(daily.day);
    }
    // This run's summary (plan 30): single-player and Daily runs only; never a test run, an
    // education run (its popup promises its data stays here) or a match half.
    this.runStatsOn = !this.match && !this.runIsTest && !this.runIsEducation;
    if (this.runStatsOn) this.statCall('begin', {
      runId: newId(),
      session: this.runSession(),
      mode: daily ? 'daily' : 'single',
      day: daily?.day ?? null,
      toilet: this.toilet,
      level: this.level,
      version: APP_VERSION,
      now: this.statNow(),
      wall: Date.now(),
      webdriver: globalThis.navigator?.webdriver === true,
      touch: (globalThis.navigator?.maxTouchPoints ?? 0) > 0,
      fieldW: this.fieldW,
    });
  }

  /** A random value for this page load (never stored): which run summaries came from one page. */
  runSession() {
    if (!this.registry.get('runSession')) this.registry.set('runSession', newId());
    return this.registry.get('runSession');
  }

  /** The monotonic clock the run summary uses. */
  statNow() {
    return globalThis.performance?.now?.() ?? 0;
  }

  /**
   * Feed this run's summary (plan 30): runStats[method](...) while one is kept. The first error
   * switches the summary off for the rest of the run; the run itself never notices.
   */
  statCall(method, a, b, c, d, e, f) {
    if (!this.runStatsOn) return;
    try {
      this.runStats[method](a, b, c, d, e, f);
    } catch {
      this.runStatsOn = false;
    }
  }

  /** The poop's height over the next gap's lower lip (px; negative below it), or null with no pair ahead. */
  lipDistance() {
    let lip = null;
    let x = Infinity;
    for (const p of this.pipes.getChildren()) {
      // A bottom pipe stands up from its gap (origin at its top): its y is the gap's lower lip.
      if (!p.active || p.originY !== 0 || p.x + T.pipeWidth / 2 < this.poop.x - T.poopRadius || p.x >= x) continue;
      x = p.x;
      lip = p.y;
    }
    return lip === null ? null : lip - this.poop.y;
  }

  /** Is a queued run the one behind a best this device has not posted yet (a 🏆 plan, or a queued 🌞 score)? The queue keeps it. */
  runBehindUnposted(q) {
    const r = q?.row;
    if (!r) return false;
    if (r.mode === 'daily') return (this.dailyQueue?.load?.() ?? []).some((e) => e.playerId === q.playerId && e.day === r.day && e.score === r.score);
    const id = this.save?.id ?? null;
    return q.playerId === id && submitPlans(this.save, this.submitStore?.load?.() ?? {}).some((p) => Boolean(p.toilet) === Boolean(r.toilet) && p.score === r.score && p.level === r.level);
  }

  /**
   * Send the queued run summaries before any score post (plan 30), so the run behind a post is
   * stored first: up to LEADERBOARD.runBatchMax per player id, one call each. A row flown before the
   * device had an id takes it now. Stored or refused rows leave the queue; a 'rate limited' or
   * offline answer keeps them for the next sync (runsUnsent: the ids whose send had no usable
   * answer, whose posts then go without waiting). Never rejects.
   */
  drainRuns() {
    this.runsUnsent ??= new Set();
    if (!this.runQueue) return Promise.resolve();
    if (this.save?.id) this.runQueue.claim(this.save.id);
    const byId = new Map();
    for (const e of this.runQueue.load()) {
      if (!e.playerId) continue;
      if (!byId.has(e.playerId)) byId.set(e.playerId, []);
      const rows = byId.get(e.playerId);
      if (rows.length < LEADERBOARD.runBatchMax) rows.push(e.row);
    }
    return [...byId]
      .reduce(
        (chain, [pid, rows]) =>
          chain.then(() =>
            submitRuns(pid, rows).then((res) => {
              if (res === 'ok' || res === 'rejected') this.runQueue.remove(rows.map((r) => r.run_id));
              // No usable answer: holding this player's posts back for their runs would gain nothing.
              if (res === 'offline') this.runsUnsent.add(pid);
              else this.runsUnsent.delete(pid);
            }),
          ),
        Promise.resolve(),
      )
      .catch(() => {});
  }

  /**
   * A post whose run is still in the queue waits (plan 30): true for up to LEADERBOARD.runWaitSyncs
   * syncs of this page, then it goes anyway (a run that cannot be sent never holds a best back).
   */
  postWaits(key, queued) {
    this.postTries ??= new Map();
    if (!queued) {
      this.postTries.delete(key);
      return false;
    }
    const n = (this.postTries.get(key) ?? 0) + 1;
    this.postTries.set(key, n);
    return n <= LEADERBOARD.runWaitSyncs;
  }

  /** The run's summary row, queued for the next sync (endRun); nothing when none was kept. */
  queueRunSummary() {
    if (!this.runStatsOn) return;
    this.runStatsOn = false;
    try {
      const row = this.runStats.end({ now: this.statNow(), wall: Date.now(), score: this.score, level: this.level, won: Boolean(this.won) });
      if (row) this.runQueue.add({ playerId: this.save?.id ?? null, row }, { pinned: (q) => this.runBehindUnposted(q) });
    } catch {
      /* the summary never stops a run */
    }
  }

  /** The Daily Dump streak (plan 34) counts course `day` once its attempt is claimed (start), on its UTC day; a practice Daily (a test run) counts nothing. */
  countDailyStreak(day) {
    if (!this.runIsTest) this.streakStore.played('daily', day);
  }

  /**
   * This device's Daily Dump attempt (dailyStore): the day, the level, the score and pipes so far and
   * what was picked up; `final` once the run is over. Practice writes nothing. Returns the record.
   */
  saveDailyAttempt(final = false) {
    if (!this.runIsDaily || this.runIsTest || !this.daily) return null;
    perfMark(PERF_TAGS.daily);
    const pipes = Math.max(0, this.pipesPassed - this.daily.startPipes);
    this.daily.saved = { score: this.score, pipes };
    return this.dailyStore.save({ day: this.daily.day, playerId: this.daily.playerId, level: this.daily.level, score: this.score, pipes, collected: { ...this.collected }, final });
  }

  /** Crossfade the background to `level`'s colour (the current level's at each break; a level chosen there: plan 26, A2). */
  fadeBackground(level = this.level) {
    const from = this.bgColor.fillColor;
    const to = levelColor(level, LEVEL_COLORS, T.levels.whiteBlend);
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

  /** Bar label and fill for the current level and pipes passed; in a break, the level chosen there (plan 26, A2), empty. */
  refreshLevelBar() {
    const level = this.levelBreak ? this.breakShownLevel() : this.level;
    this.levelBar?.setColor(levelColor(level, LEVEL_COLORS)); // the level's own colour, raw (plan 28, 4.4)
    this.levelBar?.setLabel(levelLabel(this.locale, level));
    this.levelBar?.setProgress(level === this.level ? levelProgress(this.pipesPassed, this.level, this.tune) : 0);
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
      this.statCall('level', this.level);
      this.runTopLevel = Math.max(this.runTopLevel ?? 0, this.level);
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
    // "Tap to continue" in every one-player break (plan 26, A2: the gate no longer changes it).
    this.refreshGate();
    const [title, hint] = levelBannerText(this.locale, this.levelBreak ? this.breakShownLevel() : this.level, LEVELS).split('\n');
    // Every one-player break (plan 28, 5.1): the banner higher, over the poop at mid-height (eduBreakLayout's titleY); a match's as before.
    const titleY = !this.match && this.eduBreakBoxes ? this.eduBreakBoxes.titleY : GAME_HEIGHT * 0.4;
    this.levelTitle?.setY(titleY);
    this.levelHint?.setY(titleY + 72);
    this.levelSubHint?.setY(titleY + 72 + 50);
    this.levelTitle?.setText(title);
    // A match's break is a ready check: the hint is this player's state ("Tap when ready", then
    // "Ready! Waiting for P2…"); the shared count starts once both are ready (Versus.onLevelTap).
    // The line under it: a match's un-ready line, else the gate's (shown after a refused tap).
    this.levelSubHint?.setText(t(this.locale, this.match ? 'versusUnreadyHint' : 'levelGateTap'));
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
   * un-ready" under "Ready! Waiting for P2…"; at an education gate the hint holds still, and after a
   * refused tap the smaller line says what holds it (plan 26, A2). All follow the hint's visibility.
   */
  syncLevelHint(delta) {
    const hint = this.levelHint;
    if (!hint || !this.levelHintGlow) return;
    const ready = Boolean(this.match && this.levelBreak && this.versusHost()?.isReady?.(this));
    // At an education gate (plan 26, A2): the line after a refused tap, and no pulse, since a tap there
    // only explains; Review pulses instead (refreshQuizButton). breakGate is kept by refreshGate.
    const gate = Boolean(this.levelBreak && !this.match && this.breakGate);
    this.levelSubHint.setVisible(hint.visible && (ready || (gate && Boolean(this.gateTapped))));
    if (!hint.visible || !this.levelBreak || ready || gate) {
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

  /**
   * Between levels: a real pause with the level banner, the poop gliding down and bobbing: to
   * levels.breakPoopY in a normal one-player run and levels.eduBreakPoopY in an education run (both
   * mid-height: plan 28, 1.1 and 5.1; the banner over it, the 💰 pill under it), to mid-height in a
   * match half. The bean button hides while the break lasts, and the purse and the
   * beans draw above the pause shade (breakHud).
   */
  startLevelBreak() {
    if (this.state !== 'playing') return;
    this.levelBreak = true;
    this.breakMissed = []; // each break starts with nothing missed (plan 25)
    this.breakNewAsked = 0; // nor any of its new or due cards asked (plan 28, Stage 3b)
    this.breakDueAsked = 0;
    this.quizSkipWarned = false; // the first Skip in each break warns (plan 26, A2)
    this.gateTapped = false; // the gate's line shows only after a refused tap in this break (plan 26, A2)
    this.breakLevelPick = null; // no level chosen yet (plan 26, A2)
    this.breakQuitArmedAt = null; // a Quit armed at the last break never carries into this one (plan 27)
    this.refreshLevelBanner();
    this.statCall('breakStart', this.statNow());
    this.pausePlay();
    this.breakHud(true);
    this.fadeBackground();
    this.poop.setVelocity(0, 0);
    this.scaredMs = 0;
    this.refreshPoopLook(); // no scared face on the break's gliding poop (update() does not run it while paused)
    this.poop.body.setAllowGravity(false);
    this.breakGlide = this.tweens.add({
      targets: this.poop,
      y: this.match ? GAME_HEIGHT / 2 : this.runIsEducation ? T.levels.eduBreakPoopY : T.levels.breakPoopY,
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
   * A level break's HUD (plan 26): the purse and the beans (and the 📚 / 🧪 badge) above the pause
   * shade, at full brightness, so the coins held stay in view; the bean button hidden (a tap in a
   * break continues the level, it never farts). `on` false puts them back.
   */
  breakHud(on) {
    for (const o of [this.coinIcon, this.coinText, this.beanIcon, this.beanText, this.testBadge]) o?.setDepth(on ? 26 : 20);
    this.beanButton?.setVisible(!on && Boolean(this.charged));
  }

  /**
   * The tap that ends the break: new level's speed, grace, and the field pre-filled with
   * the first pair opening at mid-screen (the fart's landing). Runs inside resumePlay()
   * before the state flips, so a box spawned here starts paused and resumeEffects()
   * spins it up right after.
   */
  endLevelBreak() {
    this.closeShop({ silent: true }); // never left open into the level (a match's shared start waits for it anyway)
    // An education run continuing into this level unlocks it as a start level (plan 25); a test run never does.
    if (this.runIsEducation && !this.runIsTest) this.eduStore.unlockLevel(this.level);
    this.applyLevelPick(); // a level chosen at this break: the run goes on from its first pair (plan 26, A2)
    this.statCall('breakEnd', this.statNow());
    this.levelBreak = false;
    this.gateTapped = false;
    this.breakQuitArmedAt = null; // an armed Quit ends with its break (plan 27)
    this.breakHud(false);
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
    this.armSuperQ(); // and its challenge question bubble (plan 34)
    this.crashesThisLevel = 0;
    this.prefillPipes();
    this.refreshLevelBar();
  }

  flap(pointer) {
    unlock();
    // The chrome as of now, not as of the last frame: a tap right after a resume must not find the tray's
    // row still up (plan 28, 4.3; the row is down once the run flies again).
    this.syncChrome();
    // "Your cards" is up (the ready screen's 📚): a tap only closes it, on its release (the card's
    // dim), and a key or the pad's A closes it here. Nothing under it is pressed and no run starts.
    if (this.eduCard?.open) {
      if (!pointer) this.eduCard.hide();
      return;
    }
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
      // While the bottom row is down (plan 28, 4.3), a tap where it was flaps; ⏸ still pauses.
      const hit = this.tray ? trayHit(pointer.x, pointer.y, trayLayout(this.col.width, GAME_HEIGHT, T, this.col.x)) : null;
      const id = hit === 'pause' || this.tray?.rowShown() ? hit : null;
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
        if (hit === 'educationInfo') {
          this.openEduCardOnRelease(pointer); // the 📚 glyph: "Your cards" (plan 26, A2)
          return;
        }
        if (hit === 'versus') {
          this.toggleVersus();
          return;
        }
        if (hit === 'education') {
          this.toggleEducation();
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
    // The "?" in a pause or a level break (plan 28, 4.3): How to play, not a continue tap.
    if (pointer && this.helpShown && this.state === 'paused' && !this.shopOpen) {
      const b = this.readyBoxes?.howto;
      // An overlay over the pause (About, Settings) owns the tap, as for the shop below.
      if (b && Math.abs(pointer.x - b.x) <= b.width / 2 && Math.abs(pointer.y - b.y) <= b.height / 2 && !this.chromeArgs('tap').overlay) {
        this.handleChrome('howto');
        return;
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
    if (pointer && this.quizButtonShown() && Math.abs(pointer.x - this.quizButtonBox.x) <= this.quizButtonBox.width / 2 && Math.abs(pointer.y - this.quizButtonBox.y) <= this.quizButtonBox.height / 2) {
      this.handleChrome('quiz'); // the 📚 pill: questions, never a continue tap
      return;
    }
    const onBox = (box) => pointer && box && Math.abs(pointer.x - box.x) <= box.width / 2 && Math.abs(pointer.y - box.y) <= box.height / 2;
    if (this.quizButtonShown() && onBox(this.eduBreakBoxes?.quit)) {
      this.breakQuitTap(); // Quit (plan 25): never a continue tap
      return;
    }
    if (this.levelPickShown() && onBox(this.eduBreakBoxes?.levelStrip)) {
      // The level choice (plan 26, A2): ◀ / ▶ step it; the label between them does nothing; never a continue tap.
      if (onBox(this.eduBreakBoxes.levelDown)) this.stepBreakLevel(-1);
      else if (onBox(this.eduBreakBoxes.levelUp)) this.stepBreakLevel(1);
      return;
    }
    if (pointer && this.quizButtonShown() && this.quizCountLine?.visible && Math.abs(pointer.x - this.quizCountsBox.x) <= this.quizCountsBox.width / 2 && Math.abs(pointer.y - this.quizCountsBox.y) <= this.quizCountsBox.height / 2) {
      this.openEduCardOnRelease(pointer, () => this.toggleBreakCounts()); // the numbers under Review: what they mean, never a continue tap
      return;
    }
    if (pointer && this.bracketButtonShown() && Math.abs(pointer.x - this.bracketButtonBox.x) <= this.bracketButtonBox.width / 2 && Math.abs(pointer.y - this.bracketButtonBox.y) <= this.bracketButtonBox.height / 2) {
      this.openBracketPeek(); // a look at the bracket, never a ready tap
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
    const stored = storedLocale(browserStorage(), T.settingsKey);
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
    // Another player's code loaded (a new id): the old player's invitation flag does not carry over (plan 28, 2.4),
    // unless the Load then merges the old id into the new one (queueMerge), as the server's fold keeps it (AUD-039).
    if (this.save?.id && state?.id && state.id !== this.save.id) {
      this.eduInvitedFrom = this.eduInvited() ? this.save.id : null;
      this.settings?.set?.({ eduInvited: false });
    }
    this.save = state;
    this.refreshProfile();
    this.refreshDailyPrompt();
    this.scene.get('Daily')?.refresh?.(); // the popup's button: Create user ⟷ Play / See today's result
    this.scene.get('Stats')?.refresh?.(); // the profile's gate ⟷ the profile (a name saved, or Clear)
  }

  /** Has this player used today's Daily Dump on this device (a record for today, finished or cut off)? */
  dailyPlayedToday() {
    return Boolean(this.save?.id && this.dailyStore.load(utcDayKey(), this.save.id));
  }

  /**
   * One play per player per day, across devices: ask the 🌞 board whether this user code already has
   * today's score (from any device). When it does, that becomes this device's attempt, final (so the
   * popup offers today's result and the 🌞 stops glowing). Resolves true when today is played here
   * or there; offline or unnamed, false (the server still keeps only the first score of the day).
   */
  async checkDailyOnServer() {
    const id = this.save?.id;
    if (!id || !this.save?.name) return false;
    if (this.dailyPlayedToday()) return true;
    const day = utcDayKey();
    const rows = await fetchDailyBoard(id, day);
    const me = rows?.find((r) => r.me);
    if (this.dailyStore.load(day, id)) return true; // a run here claimed the day while the board answered
    if (!me || this.save?.id !== id) return false;
    this.dailyStore.save({ day, playerId: id, level: me.level, score: me.score, pipes: me.pipes, collected: {}, final: true });
    this.refreshDailyPrompt();
    return true;
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
   * one is finalised and queued by the sync first), over a finished screen ('dead'). Its rank comes
   * from the board when it answers.
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
    // A finished screen, as under any game over: Over's taps also reach this scene (and its keys too),
    // and on the ready screen flap() would start a run behind the result. 'dead' makes it ignore them,
    // and Over's Home is a plain retry. Home restarts this scene.
    this.state = 'dead';
    this.scene.launch('Over', {
      score: after.score,
      won: false,
      test: false,
      toilet: false,
      level: after.level,
      pipes: after.pipes,
      collected: { fiber: 0, probiotic: 0, postbiotic: 0, bacteria: 0, bean: 0, mystery: 0, coin: 0, ...after.collected },
      daily: { day, level: after.level, playerId: this.save.id, practice: false, sync },
    });
    return true;
  }

  /**
   * The save panel's Clear: this device forgets its player (name, id, top scores), the last
   * confirmed submits, any queued merge, the legacy best (create() would re-seed it) and the
   * education cards' progress, so the next username starts a brand-new player. Settings stay
   * (the 📚 switch among them), but for the invitation flag, which was the old player's. The board
   * keeps the old id's rows.
   */
  signOut() {
    this.setSaveState(saveLocal({}));
    this.submitStore.clear();
    this.mergeStore.clear();
    this.renameStore.clear();
    this.careerStore.clear(); // counters and badges go with the player
    this.streakStore.clear(); // and the day streaks (plan 34)
    this.eduStore.clear(); // and the education cards' progress (plan 21); the 📚 switch is a setting and stays
    this.eduShare.clear(); // this device stops sending to the 📚 board; a row the old player shared stays there until they stop sharing
    this.consentStore.clear(); // and stops recording for the pilot: answers already sent stay on the server until the tester withdraws
    this.settings?.set?.({ eduInvited: false }); // the invitation belonged to the player signed out (plan 28, 2.4)
    this.researchQueue.clear();
    this.refreshTestBadge();
    this.refreshEduDue();
    this.best.clear();
    this.boardNameTaken = false;
    this.boardBestsFor = null;
  }

  /**
   * Send queued merges, then finished tournaments (🏅, tournamentQueue: they post
   * whether or not this device has a username), then post the player's best to
   * the shared leaderboard when it is newer than the last confirmed submit. Named players only; the id is created on first use
   * (same as the first save-code export). Before posting, the device takes the
   * board's name for its player unless the player renamed here (nameAction), so
   * a rename made on another device sticks. After the daily scores, the career
   * (lifetime counters and achievement claims, drainCareer), then the education
   * grades of a player who shares them (drainEduShare). A pilot tester's answer
   * events go early, username or not (drainResearch). Resolves on every
   * outcome; a failed post is retried on the next game over or board open.
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
    // A pilot tester's answer events (plan 21) need no username either: joining made the id.
    const research = tournaments.then(() => this.drainResearch());
    // Daily Dump scores carry their own id too; a device with no username sends them under the
    // name they were queued with (a named device sends after the name check below).
    if (!this.save?.name) return research.then(() => this.drainRuns()).then(() => this.drainDaily()).catch(() => {});
    if (!this.save.id) this.save = ensureId(this.save);
    const id = this.save.id;
    const renamedHere = () => {
      const p = this.renameStore.load();
      return Boolean(p && p.id === id && p.name === this.save.name);
    };
    return research
      .then(() => (renamedHere() ? null : this.fetchPlayerName(id))) // a rename typed here goes to the board, not the other way round
      .then((board) => {
        if (this.save?.id === id && nameAction({ local: this.save.name, board, pending: this.renameStore.load(), id }) === 'adopt') this.adoptBoardName(board);
      })
      .then(() => this.pullBoardBests(id))
      .then(() => this.creditCareer()) // bests from other devices earn their score and level badges here
      .then(() => this.drainRuns()) // run summaries first, so the run behind each post below is stored (plan 30)
      .then(() => this.drainDaily())
      .then(() => this.drainCareer(id))
      .then(() => this.drainEduShare(id))
      .then(() =>
        // Up to two rows per player: best off the toilet and best on it, posted one after the other.
        submitPlans(this.save, this.submitStore.load()).reduce(
          (chain, plan) =>
            chain.then(() => {
              // Its run is still queued (the send above was refused or lost): it waits a sync or three (plan 30).
              const queued = !this.runsUnsent?.has(plan.playerId) && waitsForRun(this.runQueue?.load?.() ?? [], { playerId: plan.playerId, mode: 'single', toilet: plan.toilet, score: plan.score, level: plan.level });
              if (this.postWaits(`s:${plan.toilet ? 1 : 0}:${plan.score}:${plan.level}`, queued)) return null;
              return submitScore(plan).then((res) => {
                if (res.ok) {
                  this.submitStore.save(plan);
                  this.boardNameTaken = false;
                  const p = this.renameStore.load();
                  if (p && p.id === plan.playerId && p.name === plan.name) this.renameStore.clear(); // the board has the rename now
                } else if (res.reason === 'nameTaken') {
                  this.boardNameTaken = true; // another player holds the name: the panel and the board say so
                }
              });
            }),
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
      const queued = !this.runsUnsent?.has(e.playerId) && waitsForRun(this.runQueue?.load?.() ?? [], { playerId: e.playerId, mode: 'daily', day: e.day, score: e.score });
      if (this.postWaits(`d:${e.playerId}:${e.day}:${e.score}`, queued)) return 'keep'; // its run goes first (plan 30)
      return submitDailyScore({ ...e, name }).then((res) => {
        if (res === 'nameTaken' && e.playerId === this.save?.id) this.boardNameTaken = true;
        return res;
      });
    });
  }

  /** The player's two board rows [off the toilet, on it] (player_rank: aliases resolved), each null when missing or unreachable. A method so the smoke can stub it. */
  fetchBoardBests(id) {
    return Promise.all([fetchRank(id, false), fetchRank(id, true)]);
  }

  /**
   * Scores flow down too: the board's best off and on the toilet (played on another device, or
   * under an id merged into this one) join this device's top list, once per page load and id
   * (a Load asks again: forgetRename). The home button, an open save panel's welcome line and
   * code follow. A pulled row that is now this device's best of its kind is filed as its last
   * confirmed submit, so submitPlans does not post the board's own score back. Never rejects.
   */
  pullBoardBests(id) {
    if (!this.save?.name || this.boardBestsFor === id) return Promise.resolve();
    return this.fetchBoardBests(id)
      .then((rows) => {
        const got = (rows ?? []).filter((r) => r && Number.isInteger(r.score) && r.score > 0);
        if (!got.length || this.save?.id !== id) return; // offline, no rows yet, or another player by now
        this.boardBestsFor = id;
        const before = this.save.top.map((e) => `${e.score}${e.toilet ? 't' : ''}`).join();
        const next = mergeBoardBests(this.save, got);
        if (next.top.map((e) => `${e.score}${e.toilet ? 't' : ''}`).join() !== before) {
          this.setSaveState(saveLocal(next));
          showBoardScores();
        }
        const best = { off: this.save.top.find((e) => !e.toilet), on: this.save.top.find((e) => e.toilet) };
        for (const r of got) {
          const kind = r.toilet ? 'on' : 'off';
          const mine = best[kind];
          if (mine && mine.score === r.score && Boolean(mine.toilet) === Boolean(r.toilet)) {
            this.submitStore.save({ playerId: id, name: this.save.name, score: mine.score, toilet: mine.toilet, level: mine.level });
          }
        }
      })
      .catch(() => {});
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

  /** A Load: the code's name is not a rename, so the next sync takes the board's latest (and pulls its scores again). */
  forgetRename() {
    this.renameStore.clear();
    this.boardBestsFor = null;
    this.careerStore.clearBase(); // the device may now be another player: their totals come with the next sync
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
    // The invited player merged into the one now on this device: invited still (fold_player keeps either's; AUD-039).
    if (this.eduInvitedFrom && this.eduInvitedFrom === mergeId && this.save?.id === keepId) this.settings?.set?.({ eduInvited: true });
    this.eduInvitedFrom = null;
    this.syncLeaderboard();
    return true;
  }

  refreshProfile() {
    const named = Boolean(this.save?.name);
    this.profileBtn?.setText(profileButtonText(this.locale, this.save));
    this.profileBtn?.pulse(!named); // the user button breathes with its halo until a username is set
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
    this.howToBtn?.pulse(false);
  }

  openSavePanel(opts = {}) {
    openSavePanel({ game: this.game, play: this, locale: this.locale, ...opts });
  }

  /**
   * The 📚 Education data panel (plan 21): where a player chooses to share their education grades
   * on the 📚 board. From the user panel's button, the 📚 board's footer and the profile's row;
   * only while education mode is available (EDUCATION.enabled). `onClose(changed)` runs when it closes.
   */
  openEduData(opts = {}) {
    if (!this.eduDataReachable()) return;
    openEduDataPanel({ game: this.game, play: this, locale: this.locale, ...opts });
  }

  /**
   * Can this device open 📚 Education data? While education is available; and with the off switch set,
   * still while it holds a pilot consent or shares on the 📚 board, so Withdraw and Stop sharing stay
   * reachable (RESEARCH.md) while the mode is hidden for everyone (AUD-037).
   */
  eduDataReachable() {
    return this.educationAvailable() || Boolean(this.researchConsent?.()) || Boolean(this.eduShare?.load?.().on);
  }

  /** How many cards this device has answered (the 💾 part's count; plan 28, 3.1b). */
  eduCardCount() {
    return Object.keys(this.eduStore?.load().cards ?? {}).length;
  }

  /** Has this device answered a card (is there anything to back up)? */
  eduHasCards() {
    return this.eduCardCount() > 0;
  }

  /** The backup file's text (educationBackup: the cards and three settings, nothing that names the player), or null with no cards. */
  eduBackupText() {
    const record = this.eduStore.load();
    if (!Object.keys(record.cards).length) return null;
    return JSON.stringify(educationBackup(record, this.settings.load(), Date.now()));
  }

  /**
   * A restore changes the cards, so it runs only on the home screen (plan 28, 3.1b): not over a
   * paused run, a revive, the game-over panel or a match, where a quiz may be using them.
   */
  canRestoreEducation() {
    return this.state === 'ready' && !this.match;
  }

  /**
   * Restore a backup's text into this device's cards (mergeEducation; restored runs never reach the
   * 📚 board, boardRecord). When it changed something, the backup's new-card order, start level and new cards per level
   * apply where this device still has the defaults (restoredSettings); the 📚 switch is not carried,
   * and nothing is sent. Returns the store's
   * summary with `skipped`, or { ok: false, error: 'notHome' | 'unrecognised' | 'newer' | 'tooBig' }.
   */
  restoreEducation(text) {
    if (!this.canRestoreEducation()) return { ok: false, error: 'notHome' };
    const read = readEducationBackup(text);
    if (!read.ok) return read;
    const r = this.eduStore.restore(read.backup, { today: localDayKey() });
    // The backup's settings only with a restore that changed something ("Nothing new" changes nothing).
    const patch = r.changed ? restoredSettings(this.settings.load(), read.backup.settings) : {};
    if (Object.keys(patch).length) this.settings.set(patch);
    this.refreshEduDue();
    return { ok: true, ...r, skipped: read.backup.skipped };
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
    if (this.versusOn && this.educationOn && this.educationAvailable()) this.toggleEducation(); // 👥 and 📚 are never on together; a 📚 hidden by the off switch keeps its stored choice (plan 28)
  }

  /**
   * 👥 and 📚 both read on (📚 turned on in another tab, 👥 on in this one): where 👥 is offered,
   * launch() starts a match, so 👥 wins in this tab and 📚 reads off here. The stored 📚 setting
   * is left as it is, for the other tab (plan 24, AUD-020). True when it turned 📚 off.
   */
  reconcileSwitches() {
    if (!(this.educationOn && this.versusOn && this.versusOffered())) return false;
    this.educationOn = false;
    return true;
  }

  /** The 📚 switch is offered while education mode is available (EDUCATION.enabled; plan 28: no unlock word), outside a match. */
  educationOffered() {
    return !this.match && this.educationAvailable();
  }

  /** The 📚 switch: on or off, remembered in the settings store; switching it on switches 👥 off. It opens nothing (plan 26, A2: the 📚 popup opens at a start instead). */
  toggleEducation() {
    this.educationOn = !this.educationOn;
    this.settings.set({ education: this.educationOn });
    this.educationToggle?.setOn(this.educationOn);
    if (this.educationOn && this.versusOn) this.toggleVersus();
    // Switched on: ask the browser to keep this site's storage (the cards' schedule lives there), once a
    // page load (the game's registry outlives the scene's restarts).
    if (this.educationOn && !this.registry?.get('storagePersistAsked')) {
      this.registry?.set('storagePersistAsked', true);
      try {
        globalThis.navigator?.storage?.persist?.()?.catch?.(() => {});
      } catch {
        /* no storage manager: nothing to ask */
      }
    }
  }

  /**
   * Is education mode available (EDUCATION.enabled, the off switch; plan 28, 2.3)? The ready screen, the
   * save panel, the 📚 tab and the profile ask. Read each time (the ready screen lays out before create()
   * reaches the settings); eduAvailable, when a test sets it, stands in for the config.
   */
  educationAvailable() {
    return (this.eduAvailable ?? EDUCATION.enabled) !== false;
  }

  /**
   * The ready-screen boxes for the switches offered now (🚽 always; 👥 and 📚 when offered). The
   * switch boxes keep their objects across a re-layout (switchBoxes), because the focus ring holds
   * them; a switch not offered has no box in readyBoxes, so readyHit never finds it.
   */
  layoutReady() {
    const at = (opts) => readyLayout(this.col.width, GAME_HEIGHT, T, this.col.x, opts);
    if (!this.switchBoxes) {
      const all = at({ versus: true, education: true }); // real geometry for a switch not yet offered
      this.switchBoxes = Object.fromEntries(['toilet', 'versus', 'education', 'educationInfo'].map((id) => [id, { ...all[id] }]));
    }
    const next = at({ versus: this.versusOffered(), education: this.educationOffered() });
    for (const id of ['toilet', 'versus', 'education', 'educationInfo']) {
      if (next[id]) next[id] = Object.assign(this.switchBoxes[id], next[id]);
    }
    this.readyBoxes = next;
  }

  /** (Re)draw the 🚽 / 👥 / 📚 switches on their current boxes, shown while the ready UI is (readyUiShown). */
  buildReadySwitches() {
    this.toiletToggle?.destroy();
    this.versusToggle?.destroy();
    this.educationToggle?.destroy();
    this.eduDueText?.destroy();
    const b = this.readyBoxes;
    this.toiletToggle = createToggle(this, b.toilet, { on: this.toilet });
    this.versusToggle = b.versus ? createToggle(this, b.versus, { on: this.versusOn, glyph: VERSUS_EMOJI }) : null;
    this.educationToggle = b.education ? createToggle(this, b.education, { on: this.educationOn, glyph: EDUCATION_EMOJI }) : null;
    // The cards due for review, a small gold count on the 📚's top-right corner (refreshEduDue).
    this.eduDueText = b.education
      ? this.add
          .text(b.education.emojiX + 30, b.education.y - 24, '', { ...TEXT_STYLE, fontSize: '26px', color: '#ffd700', strokeThickness: 6 })
          .setOrigin(0.5)
          .setDepth(22)
      : null;
    // The learning streak, a small number at the 📚's bottom right (plan 34), under the due count.
    this.eduStreakText?.destroy();
    this.eduStreakText = b.education ? this.streakMark(b.education.emojiX + T.streakMarkPx.dx, b.education.y + T.streakMarkPx.eduDy) : null;
    for (const toggle of [this.toiletToggle, this.versusToggle, this.educationToggle]) toggle?.setVisible(this.readyUiShown);
    this.refreshEduDue();
  }

  /** May an education run start at a later level? 📚 offered, not in test mode, and a level past 1 unlocked (plan 25; the 📚 popup's ◀ LV n ▶ since plan 26). */
  eduStartOffered() {
    return this.educationOffered() && !this.isTestMode() && (this.eduStore?.load().unlockedLevel ?? 1) > 1;
  }

  /** The level the next education run starts at: the stepper's choice, never past the levels unlocked. */
  eduStartLevel() {
    const top = this.eduStore?.load().unlockedLevel ?? 1;
    return Math.min(Math.max(1, Math.round(this.settings.load().eduStartLevel ?? 1) || 1), top);
  }

  /** ◀ / ▶ in the 📚 popup: one level down or up, wrapping within the levels unlocked. */
  stepEduStart(step) {
    this.settings.set({ eduStartLevel: nextEduStartLevel(this.eduStartLevel(), step, this.eduStore.load().unlockedLevel) });
  }

  /**
   * Open the 📚 quiz (plan 21) in an education run: 'break' in a level break (chromeIntent's
   * 'quiz'), 'revive' after an education crash (tickRespawn), or 'bonus' from the game-over panel of
   * a won run (the rectum's questions, no coins). The Quiz scene asks quizNext for its
   * cards and hands each answer to quizAnswer (a revive's moves to reviveEvent).
   */
  openQuiz(mode) {
    if (!this.runIsEducation || this.quizOpen) return;
    this.quizOpen = true; // until the Quiz scene shuts down (onQuizClosed)
    this.focus?.hide();
    this.scene.launch('Quiz', { mode });
    this.scene.bringToTop('Quiz');
    this.refreshShopButton(); // the 📚 pill hides under its quiz
  }

  /**
   * The quiz's next card: { card, reason, order } or null when nothing is left (pickCard). A break
   * asks about the segment just cleared (the level before this.level, which already counts the next
   * one); `exclude` is the session's cards so far. The draws use Math.random, never the course's rng.
   * A test run saves no answers, so what is due never clears: its quizzes walk the level's deck
   * instead ('browse'; the cleared level's in a break, this level's in a revive), and the cards they
   * have shown are kept for the page load (the registry, like test mode itself).
   */
  quizNext({ mode = 'break', exclude = [] } = {}) {
    const store = this.eduStore.load();
    const { level, segment } = this.quizScope();
    let pick;
    if (this.runIsTest) {
      const shown = this.registry.get('testQuizShown') ?? [];
      pick = pickCard({ srs: store.cards, context: 'browse', segment, exclude, shown });
      if (pick) this.registry.set('testQuizShown', [...shown.filter((id) => id !== pick.card.id), pick.card.id]);
    } else {
      // A level break's own quiz asks what is due first, then what it missed, with new cards where the
      // player's order puts them (plan 25; settings eduNewOrder, plan 26); the bonus quiz keeps the
      // break context's new-first order. New cards stop at the day's cap while there is one (newPerDay: held off since plan 28, Stage 3b);
      // a break's own quiz keeps to its two limits (breakLimits), and past its due limit the other due cards come as `beyond`.
      const own = mode === 'break';
      pick = pickCard({ srs: store.cards, context: mode === 'revive' ? 'revive' : 'break', level, segment, now: Date.now(), exclude, recent: store.recent, rng: Math.random, order: this.settings?.load().eduNewOrder, skipped: buriedIdsOn(store.buried, localDayKey()), ...(own ? this.breakQuizOptions() : {}) });
    }
    return pick ? { ...pick, order: shuffleOptions(Math.random) } : null;
  }

  /** Where the run is, for a quiz's cards: the level, and the segment a break asks about (the level just cleared; in a revive or the bonus quiz, the one being flown). */
  quizScope() {
    const level = Math.min(Math.max(1, this.level), LEVELS.length);
    return { level, segment: LEVELS[Math.max(0, (this.levelBreak ? this.level - 1 : this.level) - 1)]?.key ?? null };
  }

  /**
   * What a quiz in `mode` can still ask now: { new, missed, review } (cardCounts), with the same
   * level and segment quizNext picks by. `exclude` is the quiz's cards already asked. Null in a test
   * run, whose quizzes walk the deck and ignore the schedule. The level break's pill and the quiz
   * card's count line show it.
   */
  quizCounts({ mode = 'break', exclude = [], limits = true } = {}) {
    if (this.runIsTest || mode === 'super') return null; // a challenge question has no count line (plan 34)
    const store = this.eduStore.load();
    // The day's skipped ids, as quizNext passes them: a new card among them is not counted; a break's own
    // quiz counts within its two limits (plan 28, Stage 3b), unless `limits` is false (quizMoreDue).
    return cardCounts(store.cards, { context: mode === 'revive' ? 'revive' : 'break', ...this.quizScope(), now: Date.now(), exclude, skipped: buriedIdsOn(store.buried, localDayKey()), ...(mode === 'break' ? this.breakQuizOptions({ limits }) : {}) });
  }

  /**
   * A level break's own quiz, as pickCard and cardCounts both take it (AUD-058: one set, so the counts
   * stay the picks): dueFirst, the cards missed in this break, and the break's two limits (breakLimits;
   * left out with `limits` false, quizMoreDue's count of every due card).
   */
  breakQuizOptions({ limits = true } = {}) {
    return { dueFirst: true, missed: this.breakMissed ?? [], ...(limits ? this.breakLimits() : {}) };
  }

  /**
   * A level break's two limits (plan 28, Stage 3b): { newLeft, dueLeft } for pickCard and cardCounts.
   * newLeft: the new cards the player lets a break ask a visit (settings eduNewPerLevel: 3, 5 or 'all')
   * less those this break asked or skipped; dueLeft: education.duePerBreak less the stored due cards it
   * asked or skipped (null: no limit). Cards missed in this break are never limited.
   */
  breakLimits() {
    const per = this.settings?.load().eduNewPerLevel;
    const cap = T.education.duePerBreak;
    return {
      newLeft: typeof per === 'number' ? Math.max(0, per - (this.breakNewAsked ?? 0)) : Infinity,
      dueLeft: Number.isFinite(cap) ? Math.max(0, cap - (this.breakDueAsked ?? 0)) : Infinity,
    };
  }

  /** The due cards past a level break's gate (plan 28, Stage 3b), which Keep practicing asks before practice: 0 outside a break. */
  quizMoreDue({ exclude = [] } = {}) {
    if (this.runIsTest || !this.levelBreak) return 0;
    const all = this.quizCounts({ mode: 'break', exclude, limits: false });
    const gate = this.quizCounts({ mode: 'break', exclude });
    return all && gate ? Math.max(0, all.missed + all.review - (gate.missed + gate.review)) : 0;
  }

  /**
   * One answer from the quiz: graded (gradeFor: right on a card's first sight is good; an interrupted
   * answer's time is not used) and, outside a test run, scheduled and saved (schedule, eduStore). A
   * practice card answered right keeps its schedule. Counted in runQuiz (tallyAnswer). A right answer
   * in a level break pays education.breakCoins by why the card was asked (plan 28, Stage 3b: a new card
   * 3, a due review 2, practice 1, a missed card 1; an unknown reason the least; takeCoins: the purse,
   * the coin sound), once per card a local day, practice included (plan 26, A2): the store's `paid`
   * keeps which cards paid today, so only the day's first right answer pays, at its own kind's rate; a
   * test run keeps no record, so every right answer pays there. Returns { correct, grade, coins, paidToday, dueAt }: paidToday, a
   * right answer in a break that paid nothing because the card paid today; dueAt, when the card comes
   * back (its saved record's), null when nothing was saved (a test run, test mode).
   */
  quizAnswer({ card, reason, beyond = false, order = [], chosen, rtMs, interrupted, mode = 'break', input = 'key' }) {
    if (mode === 'super') return this.superQAnswer({ card, chosen, rtMs, interrupted });
    const correct = chosen === 'answer';
    const store = this.runIsTest ? null : this.eduStore.load();
    const known = store?.cards[card.id] ?? null;
    const grade = gradeFor(correct, interrupted ? null : rtMs, T, { first: !known });
    let dueAt = null;
    const now = Date.now();
    const day = localDayKey(new Date(now));
    // A right answer in a level break pays, once per card a local day (plan 26, A2: practice too,
    // and a card missed on purpose and then answered right pays nothing more that day).
    const payable = correct && mode === 'break';
    const paidToday = payable && Boolean(store) && paidOn(store.paid, day).includes(card.id);
    const rates = T.education.breakCoins;
    const coins = payable && !paidToday ? (rates[reason] ?? Math.min(...Object.values(rates))) : 0;
    // Nothing is saved or recorded in a test run, nor while test mode is on: it can be turned on
    // after the run ended, from the game-over screen's profile (plan 25, A5), before the bonus quiz.
    if (!this.runIsTest && !this.isTestMode()) {
      const rec = known;
      const next = schedule(rec, grade, now, T, { practice: reason === 'practice' });
      // One write: the card, today's pay mark if it paid, and the learning streak (plan 26, A2).
      this.eduStore.answer(card.id, next, { ...(coins ? { paidDay: day } : {}), studyDay: day });
      dueAt = next.dueAt;
      // A pilot tester's answer is recorded as an event (plan 21; never in a test run, and only
      // while joined): what was asked and picked, and what the device knew of the card before.
      if (this.researchJoined()) this.recordAnswerEvent({ card, reason, order, chosen, correct, rtMs, interrupted, grade, mode, input, before: rec, now });
      // A break's miss is asked again in this break until it is answered right (plan 25). A new card takes
      // one of the break's new cards, a stored due card one of its due ones; a retry of this break's miss
      // takes neither (plan 28, Stage 3b: breakLimits). A due card past the gate (`beyond`, asked under Keep
      // practicing) is optional: it takes nothing and a miss of it does not hold the gate (it stays due).
      if (mode === 'break' && this.levelBreak && !beyond) {
        const retry = (this.breakMissed ?? []).includes(card.id);
        if (reason === 'new') this.breakNewAsked = (this.breakNewAsked ?? 0) + 1;
        else if (!retry && (reason === 'missed' || reason === 'review')) this.breakDueAsked = (this.breakDueAsked ?? 0) + 1;
        const missed = (this.breakMissed ?? []).filter((id) => id !== card.id);
        this.breakMissed = correct ? missed : [...missed, card.id];
      }
    }
    // The run's tally (plan 22, U4), by level: a break asks about the level just cleared, a revive
    // about the one being flown. The bonus quiz's answers after a win are part of the run too (plan
    // 26), in the last level's row, and the run waiting to be recorded follows them; none counts in a
    // test run or under test mode, which save nothing.
    const bonus = mode === 'bonus';
    if (!bonus || (!this.runIsTest && !this.isTestMode())) this.runQuiz = tallyAnswer(this.runQuiz, this.levelBreak ? this.level - 1 : this.level, correct);
    if (bonus && !this.runIsTest && !this.isTestMode()) {
      const pending = this.eduStore.load().pending;
      // Caught up is judged again after each bonus answer (plan 34, 🤓): a right one can clear what was due, a miss leaves a card due.
      if (pending) this.eduStore.setPending({ ...pending, tally: { ...this.runQuiz }, caughtUp: this.eduCaughtUp() });
    }
    if (coins) {
      this.takeCoins(coins);
      this.refreshLevelBanner();
      this.refreshShopButton();
    }
    return { correct, grade, coins, paidToday, dueAt };
  }

  /**
   * One answer into the pilot's queue (src/research.js answerEvent). Its ids: the event's own, this
   * page load's (the registry's researchSession) and this run's. step: a revive's misses so far, or
   * its streak so far. Sent with the next sync (drainResearch).
   */
  recordAnswerEvent({ card, reason, order, chosen, correct, rtMs, interrupted, grade, mode, input, before, now }) {
    const consent = this.consentStore.load();
    if (!consent || !this.researchJoined()) return;
    if (!this.registry.get('researchSession')) this.registry.set('researchSession', newId());
    this.runId ??= newId();
    this.runEvents += 1;
    const phase = this.revive?.phase;
    const step = mode !== 'revive' ? null : phase === 'strikes' ? this.revive.strikes : phase === 'streak' ? this.revive.streak : null;
    this.researchQueue.add(
      answerEvent({
        ids: { event: newId(), session: this.registry.get('researchSession'), run: this.runId },
        card,
        context: mode === 'revive' || mode === 'bonus' ? mode : 'break',
        seq: this.runEvents,
        step,
        level: this.levelBreak ? this.level - 1 : this.level,
        order,
        chosen,
        correct,
        rtMs,
        interrupted,
        grade,
        reason,
        before,
        now,
        locale: this.locale,
        field: this.fieldW > FIELD.minWidth ? 'wide' : 'phone',
        input,
        consent: consent.version,
        phase: consent.phase,
      }),
    );
  }

  /**
   * The challenge bubble touched (plan 34): the run holds (physics and effects paused, as a pause, but no
   * PAUSED banner, tray or "?": chromeState) and the Quiz scene offers the card ('super'). No unmet card left
   * (another tab answered the last): nothing happens and the bubble is gone.
   */
  offerSuperQ() {
    const sq = this.superQ;
    if (!sq || sq.done || this.quizOpen || this.state !== 'playing') return; // done: taken, or farted through (AUD-064)
    sq.done = true;
    const card = pickSuperCard(this.eduStore.load().cards);
    if (!card) return;
    sq.card = card;
    sq.reward = superQReward(this.level, T);
    this.superQHold = true;
    this.state = 'paused';
    this.respawnPaused = false;
    this.physics.pause();
    this.pauseEffects();
    this.bob.pause();
    this.syncChrome();
    this.openQuiz('super');
  }

  /** The challenge card and its options' order, for the Quiz scene's Try (plan 34). */
  superQPick() {
    const card = this.superQ?.card;
    return card ? { card, reason: 'super', order: shuffleOptions(Math.random) } : null;
  }

  /** What a wrong challenge answer would cost now (plan 34): the offer shows it. */
  superQPenaltyNow() {
    return superQPenalty(this.effects?.coins() ?? 0, T);
  }

  /**
   * A challenge answer (plan 34): saved to the card's schedule like any first sight (right: review later;
   * wrong: missed, due now), and a study day; right pays superQReward (the coin sound, the purse's glow),
   * wrong takes superQPenalty. Outside the run's tally, the grade, 💯 and 🤓, and never a pilot event (the
   * server takes break, revive and bonus answers only). A test run saves nothing. Returns { correct, grade,
   * coins, lost, dueAt }.
   */
  superQAnswer({ card, chosen, rtMs, interrupted }) {
    const correct = chosen === 'answer';
    const saving = !this.runIsTest && !this.isTestMode();
    const known = saving ? (this.eduStore.load().cards[card.id] ?? null) : null;
    const grade = gradeFor(correct, interrupted ? null : rtMs, T, { first: !known });
    let dueAt = null;
    if (saving) {
      const now = Date.now();
      const next = schedule(known, grade, now, T);
      this.eduStore.answer(card.id, next, { studyDay: localDayKey(new Date(now)) });
      dueAt = next.dueAt;
    }
    let coins = 0;
    let lost = 0;
    if (correct) {
      coins = this.superQ?.reward || superQReward(this.level, T);
      this.takeCoins(coins);
    } else {
      lost = superQPenalty(this.effects.coins(), T);
      if (lost) this.effects.spendCoins(lost);
      this.refreshCoinHud();
      (this.superQMissed ??= []).push(card.id);
    }
    return { correct, grade, coins, lost, dueAt };
  }

  /** The challenge card closed (declined or answered: plan 34): the run goes on as from a pause, with half a flap and the post-revive grace. */
  endSuperQ() {
    if (!this.superQHold) return;
    this.superQHold = false;
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.physics.resume();
    this.resumeEffects();
    this.bob.resume();
    this.syncChrome();
    if (!this.effects.powerActive()) this.poop.setVelocityY(resumeFlapVelocity(T));
    this.graceLeftMs = Math.max(this.graceLeftMs ?? 0, T.beans.graceMs);
    this.refreshEduDue?.();
  }

  /** The quiz closed: the 📚 and 💰 pills come back (the closing tap is locked out by the caller). */
  onQuizClosed(mode) {
    this.quizOpen = false;
    this.refreshEduDue();
    this.refreshShopButton();
    if (this.levelBreak) this.refreshLevelBanner(); // the gate's hint follows what the quiz cleared (plan 25)
    if (mode === 'revive') this.reviveDone();
    if (mode === 'bonus') this.refreshOverEducation();
    if (mode === 'super') this.endSuperQ();
  }

  /** Re-lay and redraw the switches when what is offered changes (test mode hides 👥; the word shows 📚). */
  refreshReadySwitches() {
    if (!this.readyBoxes) return;
    this.layoutReady();
    this.buildReadySwitches();
  }

  /**
   * A press on the 📚 glyph opens "Your cards" when the finger lifts: the card's dim closes on a
   * release, so a card opened on the press would shut again at once. The release must be that
   * pointer's (plan 25, A6): one press is armed at a time, a second press on the glyph replaces it,
   * another finger's release does nothing, and a release outside the canvas or a cancelled touch
   * (Phaser's pointer.wasCanceled) disarms it without opening. (The 📚 popup took the glyph in plan
   * 26's step 9; "Your cards" came back in its A2, Michael's checklist.)
   */
  openEduCardOnRelease(pointer = null, show = () => this.toggleEduCard()) {
    this.eduCardPress?.done();
    const id = pointer?.id ?? null;
    const mine = (p) => id === null || p?.id === id;
    const press = {
      id,
      done: () => {
        this.input.off('pointerup', open);
        this.input.off('pointerupoutside', away);
        if (this.eduCardPress === press) this.eduCardPress = null;
      },
    };
    const open = (p) => {
      if (!mine(p)) return;
      press.done();
      if (!p?.wasCanceled) show();
    };
    const away = (p) => {
      if (mine(p)) press.done();
    };
    this.eduCardPress = press;
    this.input.on('pointerup', open);
    this.input.on('pointerupoutside', away);
  }

  /**
   * "Your cards" (plan 21, E3; back on the 📚 glyph in plan 26's A2): what the 📚 on the ready screen
   * stands for, opened by a tap on the glyph (or A on its ring item) and closed by any tap, key or pad
   * press. Over every deck: the cards not seen yet, the missed ones due, the reviews due (cardCounts
   * 'all', the count lines in Michael's wording), how many have been seen at all, and what the gold
   * number on the 📚 counts. While it is up nothing under it is pressed and no run starts (flap,
   * onPadAction, handleChrome, launch).
   */
  toggleEduCard() {
    if (!this.eduCard) return;
    if (this.eduCard.open) {
      this.eduCard.hide();
      return;
    }
    if (this.state !== 'ready' || this.launching || this.match || !this.readyBoxes?.educationInfo || isEduIntroPanelOpen()) return; // never under the popup (AUD-034)
    const srs = this.eduStore.load().cards;
    const counts = cardCounts(srs, { context: 'all' });
    const decks = Object.values(masteryByDeck(srs));
    const seen = decks.reduce((sum, d) => sum + d.seen, 0);
    const total = decks.reduce((sum, d) => sum + d.total, 0);
    this.eduCard.show({
      glyph: EDUCATION_EMOJI,
      title: t(this.locale, 'eduCardsTitle'),
      lines: [...countLines(this.locale, counts), t(this.locale, 'eduCardsSeen').replace('{n}', String(seen)).replace('{total}', String(total)), t(this.locale, 'eduCardsDue')],
    });
  }

  /**
   * The 📚 popup (plan 26; ui/eduIntroPanel.js), on the ready screen: opened at every start with 📚 on
   * (launch, plan 26 A2), and from nowhere else since then. Returns whether it opened.
   */
  openEduIntro() {
    if (this.state !== 'ready' || this.launching || this.match || !this.readyBoxes?.educationInfo || isEduIntroPanelOpen()) return false;
    this.eduCardPress?.done(); // a "Your cards" press still down (finger 1 on 📚 as finger 2 starts) opens nothing under it (AUD-034)
    openEduIntroPanel({ game: this.game, play: this, locale: this.locale });
    return isEduIntroPanelOpen(); // whether it opened (launch starts the run when it could not)
  }

  /** What the 📚 popup shows: the three counts over every deck, cards seen of all, the start level and whether it can move, the new-card order, the daily cap. */
  eduIntroInfo() {
    const srs = this.eduStore.load().cards;
    const decks = Object.values(masteryByDeck(srs));
    const settings = this.settings.load();
    return {
      counts: cardCounts(srs, { context: 'all' }),
      seen: decks.reduce((sum, d) => sum + d.seen, 0),
      total: decks.reduce((sum, d) => sum + d.total, 0),
      startOffered: this.eduStartOffered(),
      startLevel: this.eduStartLevel(),
      order: settings.eduNewOrder,
      perLevel: settings.eduNewPerLevel, // new cards a level break asks a visit (plan 28, Stage 3b)
      hideHow: !settings.eduShowHow, // "How it works" folded (plan 28, 4.2; folded unless shown since plan 34)
      hideChoices: !settings.eduShowChoices, // "Your choices" folded
      newPerDay: T.education.newPerDay,
      testMode: this.isTestMode(), // the start-level row is hidden: a test run starts at its own level (plan 26, A2)
    };
  }

  /** The 📚 popup's new-card order: 'before', 'mixed' or 'after' the cards due (settings eduNewOrder; pickCard's order). */
  setEduNewOrder(order) {
    this.settings.set({ eduNewOrder: order });
  }

  /** The 📚 popup's new cards per level: how many new cards a level break asks a visit, 3, 5 or 'all' (settings eduNewPerLevel; breakLimits; plan 28, Stage 3b). */
  setEduNewPerLevel(n) {
    this.settings.set({ eduNewPerLevel: n });
  }

  /** The 📚 popup's Show / Hide (plan 28, 4.2): `section` 'how' or 'choices', remembered on this device (settings eduShowHow, eduShowChoices since plan 34, folded by default; not in the backup). */
  setEduIntroHidden(section, hidden) {
    const key = { how: 'eduShowHow', choices: 'eduShowChoices' }[section];
    if (key) this.settings.set({ [key]: !hidden }); // another name is ignored
  }

  /**
   * The 📚 popup's Play: 📚 on (it already is: the popup opens at a start with 📚 on; kept for safety),
   * then the run starts. Not through a tap (flap), which would open the popup again (plan 26, A2): launch with
   * `intro` false. The audio unlocks here, as a tap's flap would do.
   */
  startFromEduIntro() {
    if (this.state !== 'ready' || this.launching || this.match) return;
    if (!this.educationOn) this.toggleEducation();
    unlock();
    this.launch({ intro: false });
  }

  /** The popup closed: the ready screen's 📚 count follows what may have changed. */
  onEduIntroClosed() {
    this.refreshEduDue();
  }

  /** The 📚 switch's due count: shown with the switch, and only when a card is due. */
  refreshEduDue() {
    this.refreshStreakMarks(); // the 📚's learning streak (plan 34), the switch's or not
    // A text its scene destroyed (a late call after a restart: AUD-063) has no scene; redrawing it would throw.
    if (!this.eduDueText?.scene) return;
    const n = dueCount(this.eduStore.load().cards);
    this.eduDueText.setText(n > 0 ? String(n) : '');
    this.eduDueText.setVisible(this.readyUiShown && n > 0);
  }

  /** One streak subscript (plan 34): a small orange number with a dark outline, centred on (x, y), over the ready UI. */
  streakMark(x, y) {
    return this.add.text(x, y, '', { ...TEXT_STYLE, fontSize: T.streakMarkPx.fontPx + 'px', color: T.streakMarkPx.color, strokeThickness: 6 }).setOrigin(0.5).setDepth(22).setVisible(false);
  }

  /**
   * The streak subscripts on the ready screen (plan 34): the Daily Dump streak on the 🌞, the learning
   * streak on the 📚, each while the ready UI shows and the streak is alive (played today or yesterday);
   * nothing at 0. The 📚's only while its switch is there; the 🌞's only while the 🌞 shows.
   */
  refreshStreakMarks() {
    // Each streak is read only for a number that is there: none destroyed with its scene (a late call
    // after a restart, as AUD-063's count), none without its 📚 switch.
    const show = (text, streak, extra = true) => {
      if (!text?.scene) return;
      const n = streak();
      text.setText(n > 0 ? String(n) : '').setVisible(Boolean(this.readyUiShown) && extra && n > 0);
    };
    show(this.dailyStreakText, () => this.streakStore.now('daily', utcDayKey()), Boolean(this.dailySun?.visible));
    show(this.eduStreakText, () => studyStreakNow(this.eduStore.load().study ?? null, localDayKey()));
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
    // A run under way becomes a test run, a one-player revive quiz's included (plan 25, A5).
    if (on && (this.state === 'playing' || this.state === 'paused' || (this.state === 'respawn' && !this.match))) this.runIsTest = true;
    this.refreshReadySwitches(); // test mode takes the 👥 switch away (versusOffered), and gives it back
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
    // In a run it is the mode badge: 🧪 for a test run, 📚 for an education run (plan 21), or both.
    const show = ready ? this.isTestMode() && !this.launching : this.runIsTest || this.runIsEducation;
    this.testBadge.setVisible(show);
    if (!show) return;
    if (ready) this.testBadge.setText(t(this.locale, 'testTitle')).setPosition(this.col.x + 24, 56);
    else this.testBadge.setText(`${this.runIsTest ? '\u{1F9EA}' : ''}${this.runIsEducation ? EDUCATION_EMOJI : ''}${this.runIsEducation && !this.runIsTest && this.researchJoined() ? '\u{1F52C}' : ''}`).setPosition(this.col.x + 24, T.hudScoreY - 12); // 🔬: a pilot tester's answers are being recorded
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
    this.refreshShopButton(); // the break row: Shop, Review, Quit and the level choice's label (AUD-031)
    if (this.shopOpen) this.refreshShop();
    this.showEscapedBanner(); // a finished match half keeps its banner in the new language
    this.refreshLevelBar();
    if (this.runIsDaily) this.dailyHud.setText(`\u{1F31E} ${levelLabel(this.locale, this.level)}`);
    this.refreshTestBadge();
  }

  /**
   * The chrome by state (plan 28, 4.3: chromeShown), every frame, acting only on a change: the tray's bottom
   * row slides in or out (the first call places it), and the "?" shows in a pause or a level break, with no
   * glow there (on the home screen setReadyUiVisible keeps it, with its glow while this build's How to play is unseen).
   */
  syncChrome() {
    const shown = chromeShown({ state: this.chromeState(), launching: Boolean(this.launching), quizOpen: Boolean(this.quizOpen), shopOpen: Boolean(this.shopOpen), match: this.match?.status ?? null });
    const key = `${shown.tray}|${shown.help}|${this.state}`;
    if (key === this.chromeSeen) return;
    const first = this.chromeSeen == null;
    this.chromeSeen = key;
    this.tray?.setRowShown(shown.tray, { animate: !first });
    this.helpShown = shown.help;
    if (this.state === 'ready' && !this.launching) return; // the home screen's own "?" (setReadyUiVisible)
    this.howToHalo?.setVisible(false);
    this.howToBtn?.pulse(false);
    this.howToBtn?.setVisible(shown.help);
  }

  /**
   * The state chrome decisions (chromeIntent, padIntent) read. In a match it is the match's,
   * not this half's: a finished half (waiting for the other) or a respawning one still pauses
   * and resumes the match from its tray, keys and pad; its own level break reads 'paused', where
   * a tap lifts a shared pause or toggles this player's ready (Versus.onLevelTap: both ready
   * start the shared count, then beginLevel ends both breaks).
   */
  chromeState() {
    if (this.superQHold) return 'playing'; // a challenge question (plan 34): no tray, no "?", no PAUSED under its card
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
      education: this.runIsEducation,
    };
  }

  handleChrome(input) {
    // "Your cards" (the ready screen) or the break's numbers card up: a chrome key takes it down first.
    // Esc, a tap and the pause key (P, ⏸, the pad's Menu) do only that, so none continues a break
    // under the card (AUD-027); any other key then acts.
    if (this.eduCard?.open) {
      this.eduCard.hide();
      if (input === 'esc' || input === 'tap' || input === 'pause') return;
    }
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
      case 'openQuiz':
        this.openQuiz('break');
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
      case 'openStats': {
        if (this.overlayPause(result)) this.pauseRun();
        // Always with its player: a launch without data would reuse the last profile's.
        const target = this.statsTarget ?? null;
        this.statsTarget = null;
        if (!this.scene.isActive('Stats')) this.scene.launch('Stats', { name: target?.name ?? null });
        this.scene.bringToTop('Stats');
        break;
      }
      case 'openChangelog':
        if (this.overlayPause(result)) this.pauseRun();
        // Always on the latest version: a launch without data would reuse the last version link's { version }.
        if (!this.scene.isActive('Changelog')) this.scene.launch('Changelog', { version: null });
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

  /**
   * A flap, when one is allowed (playing, no lockout, no fart); true when it flapped. `internal`:
   * the game's own flap (the launch, a race's GO), not a press. A run's summary counts each one.
   */
  doFlap({ internal = false } = {}) {
    if (this.state !== 'playing') return false;
    // No lockout, and no fart (it carries the poop through the middle).
    const applied = !(this.time.now < this.flapLockedUntil) && !this.effects.powerActive();
    if (applied) {
      this.poop.setVelocityY(T.flapVelocity);
      sfx.flap();
    }
    if (this.runStatsOn) {
      const f = this.flapInfo;
      f.now = this.statNow();
      f.applied = applied;
      f.internal = internal;
      f.pressed = !internal && STAMP.active;
      f.trusted = f.pressed && STAMP.trusted;
      f.fresh = f.trusted && STAMP.recent && (STAMP.ts < 0 || STAMP.ts !== lastFlapTs);
      if (f.pressed && STAMP.ts >= 0) lastFlapTs = STAMP.ts;
      f.lip = this.lipDistance();
      this.statCall('flap', f);
    }
    return applied;
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
    // The chrome as of now (plan 28, 4.3), as in flap: a pad press right after a pause must find the tray's row up.
    this.syncChrome();
    const { top, scene } = this.padTop();
    // "Your cards" up on the ready screen: any press takes it down and does nothing else.
    if (top === 'play' && this.eduCard?.open) {
      this.eduCard.hide();
      return;
    }
    // A card up on the game-over panel: B takes it down (padIntent's B there only hides the ring).
    if (top === 'over' && action === 'back' && scene?.closeCard?.()) return;
    const eduIntroOpen = isEduIntroPanelOpen();
    const tournamentPanelOpen = isTournamentPanelOpen() || eduIntroOpen; // both DOM panels walk their buttons with the pad
    const ringPress = action === 'select' && Boolean(this.focus?.shown); // A on P1's ring presses the ringed button (⏸, 💰, 🏅)
    if (this.match && top === 'play' && !tournamentPanelOpen && !ringPress && (action === 'select' || action === 'power')) {
      // A match: A and RT belong to the half that claimed this pad (versusInput); the other
      // buttons stay global (pause, mute, back, the ring) through padIntent below, and so does
      // A while P1's ring shows.
      this.registry.set('padMode', true);
      this.versusInput({ kind: 'pad', index: padIndex }, action === 'select' ? 'flap' : 'power');
      return;
    }
    const result = padIntent({
      action,
      state: this.chromeState(),
      top,
      ringShown: Boolean(scene?.focus?.shown),
      savePanelOpen: isSavePanelOpen() || isEduDataPanelOpen(), // a DOM panel is up: the pad waits
      tournamentPanelOpen,
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
      case 'panel':
        if (eduIntroOpen) eduIntroPadAction(result.action); // the 📚 popup walks its own buttons (plan 26)
        else tournamentPadAction(result.action); // the tournament panel walks its own buttons
        break;
      case 'versusSelect':
        scene?.onPadSelect?.(padIndex); // the join screen claims the pad; the result panel presses Continue
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
    this.syncChrome(); // the ring walks the chrome as of now (plan 28, 4.3)
    this.pad?.padNav(dir, padIndex);
  }

  toggleMute() {
    const next = !this.settings.load().sound;
    this.settings.set({ sound: next });
    setMuted(!next);
    this.tray?.setMuted(!next);
    this.scene.get('Over')?.tray?.setMuted(!next);
  }

  /**
   * The window lost focus, the tab was hidden or the field was resized: pause a run in progress.
   * Not while an education revive's quiz is up (plan 22, F1): the world is already halted and the
   * respawn held under the card, so the card is the pause, and Fly on is the deliberate tap a resize
   * asks for. A pause there would leave the quiz's result with nothing to settle (reviveDone).
   */
  autoPause() {
    if (this.respawnHold === 'quiz' || this.superQHold) return; // the card is the pause (a revive's; a challenge question's, plan 34)
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
    if (!this.levelBreak) this.statCall('pause', this.statNow(), globalThis.document?.hidden === true);
    this.physics.pause();
    this.pauseEffects();
    this.bob.pause();
    this.setPauseBanner(true);
    this.syncChrome(); // the tray's row and the "?" at once, not at the next frame (plan 28, 4.3)
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
    if (this.state !== 'paused' || this.superQHold) return; // a challenge question resumes only when its card closes (endSuperQ)
    // The gate (plan 25; every education break since plan 26): the break stays while cards are due;
    // the hint says so and Review pulses (refreshQuizButton).
    if (this.levelBreak && !this.respawnPaused && this.breakGated()) {
      this.gateTapped = true; // the line under "Tap to continue" says why (plan 26, A2)
      this.refreshLevelBanner();
      this.refreshShopButton();
      return;
    }
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
      this.syncChrome(); // plan 28, 4.3: the row down at once
      return;
    }
    if (this.levelBreak) this.endLevelBreak();
    this.statCall('resume', this.statNow());
    this.state = 'playing';
    this.physics.resume();
    this.resumeEffects();
    this.bob.resume();
    this.setPauseBanner(false);
    this.syncChrome(); // plan 28, 4.3: the row down at once
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
    perfMark(PERF_TAGS.spawn);
    this.pipesSpawned += 1;
    const gapCfg = {
      gameHeight: GAME_HEIGHT,
      ceilingHeight: T.ceilingHeight,
      groundHeight: T.groundHeight,
      gapHeight: this.diff.gapHeight,
      gapMargin: T.gapMargin,
    };
    const n = this.pipesSpawned; // this pair's number in the run: the course rolls everything about it by n
    // The level's challenge bubble (plan 34): on its pair, or the next free one after a revive cleared it, while
    // a pair follows in the level, never on level 1's scripted pairs or the guaranteed first box's pair (the
    // re-armed bubble skips them as course.superQPair does: AUD-065). Gone once its item is (taken, flown
    // past, farted through).
    const sq = this.superQ;
    if (sq?.item && !(sq.item.active && sq.item.scene)) sq.done = true;
    const reserved = Boolean(tutorialSpawn(this.level, n, T)) || n === this.mysteryPair;
    const superHere = Boolean(sq && !sq.done && !sq.item && sq.level === this.level && n >= sq.pair && n < levelEnd(this.level, this.tune) && !reserved);
    const stillNext = this.superQStill === n;
    const centred = this.nextGapY == null && this.centreNextGap; // the pair after a fart: opens at the float height and never moves
    const gapY = this.nextGapY ?? (this.centreNextGap ? centredGapY(gapCfg) : this.course.gapY(n, gapCfg));
    this.nextGapY = null;
    this.centreNextGap = false;
    if (superHere) {
      // The next pair opens at this one's height, so the bubble between them sits on the flight line. Its own
      // gap is rolled now and dropped (this pair's draws come in a new order: unseen, since a one-player course
      // is random per run and the Daily and matches never arm a bubble; AUD-072).
      this.course.gapY(n + 1, gapCfg);
      this.nextGapY = gapY;
    }
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
    const beanRolled = !boxHere && (scripted === undefined ? this.course.bean(n, { score: this.score, spawnedThisRun: this.beanSpawned, holding: this.effects.holdingBean() }) : scripted === 'bean');
    const beanHere = beanRolled && !superHere; // the challenge bubble owns its slot (plan 34); the roll is still made
    // From pipeMove.fromLevel some pairs bob their gap: the top pipe carries the motion and its mate
    // follows in update() (the 1280 px texture covers any gap position, so only y changes). Rolled
    // after the item and bean draws so levels below fromLevel and the draws before it keep their sequence.
    // The challenge bubble's pair and the next hold still (plan 34): the roll is made, and dropped.
    const moveRolled = this.course.pipeMove(n, this.level, gapY, gapBounds(gapCfg), { centred });
    const move = superHere || stillNext ? null : moveRolled;
    if (superHere) this.superQStill = n + 1;
    else if (stillNext) this.superQStill = null;
    if (move) {
      top.setData({ move, mate: bottom, gapH });
      top.clockMs = 0; // its sine's clock (update(); a plain field: setData every frame emits events)
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
    const slotFree = !boxHere && !beanHere && kind !== 'mystery' && !superHere;
    const kernelBand = kernelDue && this.level > 1 && slotFree;
    const kernelPast = kernelDue && !kernelBand && (this.level === 1 || n >= levelEnd(this.level, this.tune));
    if (superHere) this.spawnSuperQ(gapY, shift);
    else if (boxHere) this.spawnBandItem('mystery', boxStill ? stillY() : null, shift);
    else if (kernelBand) this.markKernel(this.spawnBandItem('coin', still ? stillY() : null, shift));
    else if (band && !beanHere) this.spawnBandItem(kind, (kind === 'mystery' ? boxStill : still) ? stillY() : null, shift);
    if (kernelPast) this.markKernel(this.spawnStillCoin(x + T.coin.firstAfterPipePx, gapY));
    // An extra coin from level 2 (course.coin) only fills a band slot nothing else took, so it never
    // costs a fiber, a box, a bean or the guaranteed kernel its place.
    const slotTaken = boxHere || beanHere || band || kernelBand || kernelPast || superHere;
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
      bean.setData({ phase, still, baseScale: T.spriteDisplayScale, radius: T.beans.beanRadius });
      bean.clockMs = 0; // its bob / pulse clock (update())
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
    if (stillY == null) {
      item.setData({ bob: 'band', phase, period });
      item.clockMs = 0;
    }
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
    const elapsed = (item.clockMs ?? 0) + delta;
    item.clockMs = elapsed;
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

  /**
   * The level's challenge question bubble (plan 34): in a 📚 run while an unmet challenge card is left
   * (pickSuperCard), on the pair course.superQPair picks (never the guaranteed first box's). Taken,
   * declined, flown past or farted through, it is gone for the level; a revive that clears it brings it
   * back (clearFieldAhead).
   */
  armSuperQ() {
    const on = this.runIsEducation && !this.match && T.education.superQ.enabled && Boolean(pickSuperCard(this.eduStore?.load?.()?.cards ?? {}));
    const pair = on ? this.course.superQPair(this.level, { avoid: [this.mysteryPair] }) : null;
    this.superQ = pair ? { level: this.level, pair, item: null, done: false, card: null, reward: 0 } : null;
  }

  /** The challenge bubble on its pair's band slot, at `y` (the shared height of the gaps either side), floating gently (update: 'float'). */
  spawnSuperQ(y, shift = 0) {
    const item = this.items.create(beanSpawnX(this.fieldW, T.pipeWidth, pipeSpacing(this.level, T)) - shift, y, 'question');
    item.setDepth(8);
    this.finishItem(item, 'question');
    // Its phase from the pair number, not the course: no roll moves for it.
    item.setData({ bob: 'float', baseY: y, phase: (this.pipesSpawned * 1.7) % (Math.PI * 2) });
    item.clockMs = 0;
    if (this.superQ) this.superQ.item = item;
    return item;
  }

  /** Pause or resume the boxes' and kernels' spin with the run (the scene keeps updating while paused). */
  setBoxSpin(on) {
    for (const item of this.items.getChildren()) {
      if (item.getData('kind') !== 'mystery' && item.getData('kind') !== 'coin') continue;
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
      item.setData({ bob: 'pair', pair });
      item.clockMs = 0;
      item.y = gapY;
    } else if (this.level >= T.items.moveFromLevel) {
      const amp = gapBobAmplitude(gapH, T.items.itemRadius, T.items.moveMarginPx);
      item.setData({ bob: 'gap', baseY: gapY, amp, phase: this.course.phase(this.pipesSpawned, 'gap') });
      item.clockMs = 0;
      item.y = gapBobY(0, gapY, amp, T.items.movePeriodMs, item.getData('phase'));
    }
    return item;
  }

  finishItem(item, kind) {
    const coin = kind === 'coin'; // a kernel is drawn at coin.displayPx (from its 106 px frames), its hitbox the whole drawing
    const question = kind === 'question'; // the challenge bubble (plan 34): bigger than the box, a wider hitbox
    const scale = coin ? T.coin.displayPx / item.frame.width : question ? T.education.superQ.displayPx / item.frame.width : T.spriteDisplayScale;
    const radius = coin ? T.coin.radius : question ? T.education.superQ.radiusPx : T.items.itemRadius;
    item.setScale(scale);
    item.setData({ baseScale: scale, radius }); // the still pulse's base (pulseStill)
    item.clockMs = 0; // its pulse / bob clock (update()); a bobbing item resets it with its bob
    const itemBody = scaledCircleBody(item.frame.width, scale, radius);
    item.body.setCircle(itemBody.radius, itemBody.offset, itemBody.offset);
    item.setVelocityX(-this.scrollSpeed());
    item.setData('kind', kind);
    if (coin) {
      item.play('coin-spin'); // every field kernel spins (Boot); setBoxSpin freezes it with the run
      if (this.state === 'paused') item.anims.pause();
    }
  }

  /** Speed for the current level (the gap never changes); pushes it onto everything scrolling. */
  applyLevel() {
    this.diff = { pipeSpeed: levelSpeed(this.level, T), gapHeight: levelGap(this.level, T) };
    this.applyScroll();
  }

  /**
   * px/s the world scrolls left: the level's speed × the fart envelope. Zero through a respawn (and a pause taken in one): the world stands
   * still, so whatever is spawned or re-speeded meanwhile (an education revive refills the field
   * under its quiz card: prepareRevive) waits in place until endRespawn starts it.
   */
  scrollSpeed() {
    if (this.respawning()) return 0;
    return this.diff.pipeSpeed * this.scrollMul;
  }

  /** In a respawn, or paused in the middle of one (pausePlay keeps respawnPaused). */
  respawning() {
    return this.state === 'respawn' || (this.state === 'paused' && this.respawnPaused);
  }

  /**
   * One frame of the pre-fill's sweep-in on a wide field (prefillPipes): every swept object's x and
   * alpha from the curve, on top of the normal scroll; endSweep once the curve is done. Runs in play
   * and through a respawn.
   */
  tickSweep(delta, dt) {
    if (!this.sweep) return;
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

  /**
   * The near-miss clock, each playing frame outside a fart: a pipe's body within scaredNearPx of the
   * poop's hitbox (pipeClearance) holds the near-miss face for scaredHoldMs past the last such frame.
   * Never while the poop cannot be hurt (the grace after a fart or a respawn, test mode's Invincible):
   * it flies through pipes then.
   */
  tickScared(delta) {
    if (this.graceLeftMs > 0 || this.testInvincible()) {
      this.scaredMs = 0;
      return;
    }
    const near = this.pipes.getChildren().some((pipe) => pipe.body && pipeClearance(this.poop.x, this.poop.y, T.poopRadius, pipe.body) <= T.scaredNearPx);
    if (near && this.scaredMs <= 0) {
      this.runCloseCalls = (this.runCloseCalls ?? 0) + 1; // 😢 a close call starts the clock
      this.statCall('closeCall');
      if (this.closeCallsByLevel) this.closeCallsByLevel[this.level] = (this.closeCallsByLevel[this.level] ?? 0) + 1; // 💈 per level
    }
    this.scaredMs = near ? T.scaredHoldMs : Math.max(0, this.scaredMs - delta);
  }

  /** Swap the player texture and rebuild the circle body for that frame size. */
  setPoopTexture(key) {
    this.poop.setTexture(key);
    const body = scaledCircleBody(this.poop.frame.width, T.spriteDisplayScale, T.poopRadius);
    this.poop.body.setCircle(body.radius, body.offset, body.offset);
  }

  /**
   * The live poop's face from poopFrame(): plain or the current stink frame,
   * the falling face (sweat marks) once it drops at fallLookVy or faster, the
   * near-miss face for scaredHoldMs after a close call with a pipe. Only
   * swaps when the key changes, so the body circle is rebuilt only then. Callers
   * keep it off the fart, dead and speech frames.
   */
  refreshPoopLook() {
    // A start boost wears the fart face.
    const key = this.boost ? 'poop-fart' : poopFrame({ charged: this.charged, stinkFrame: this.stinkFrame, vy: this.poop.body.velocity.y, scared: this.scaredMs > 0 }, T);
    if (this.poop.texture.key !== key) this.setPoopTexture(key);
  }

  collectBean(bean) {
    if (this.state !== 'playing' || !bean.active) return;
    if (this.effects.holdingBean()) return; // already carrying one: let it float past
    perfMark(PERF_TAGS.pickup);
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
      // Bean button: same period as the glow, started in the same frame so they stay in phase. Hidden
      // in a level break (plan 26; breakHud shows it again when the break ends).
      this.beanButton.setVisible(!this.levelBreak).setScale(1).setAlpha(0.7);
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
    this.runFarts = (this.runFarts ?? 0) + 1;
    if (this.effects.powerIsSuper()) this.runSuperFarts = (this.runSuperFarts ?? 0) + 1;
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
    const icon = this.effects.hasPostbiotic() ? 'postbiotic' : 'probiotic';
    if (this.probioticIcon.texture.key !== icon) this.probioticIcon.setTexture(icon).setDisplaySize(T.hudProbioticSize, T.hudProbioticSize);
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
  showScorePopup(kind, mult = 1, pairs = 0, level = 1, perLevel = undefined) {
    const p = scorePopup(kind, T, mult, pairs, level, perLevel);
    if (!p) return;
    this.popupTween?.stop();
    this.scorePopup.setText(p.text).setAlpha(0);
    if (this.scorePopup.style.color !== p.color) this.scorePopup.setColor(p.color); // setColor always redraws; setText skips the same string
    this.enqueuePopup('item');
    this.popupTween = this.tweens.add({ targets: this.scorePopup, alpha: 1, duration: T.popup.fadeMs, hold: T.popup.holdMs, yoyo: true, onComplete: () => this.dequeuePopup('item') });
  }

  /** Quick "+1" / "+2"; the next pipe stops it and starts over at the bottom of the stack, so fart bursts replace each other. */
  showPipePopup(mult = 1) {
    const p = scorePopup('pipe', T, mult);
    this.pipePopupTween?.stop();
    this.pipePopup.setText(p.text).setAlpha(0);
    if (this.pipePopup.style.color !== p.color) this.pipePopup.setColor(p.color); // usually "+1" in the same colour: no redraw at all
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
    perfMark(PERF_TAGS.pickup);
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
      // A draw that cannot do anything (a bean with a full bag) becomes fiber; pairsLeft matters only to test mode's
      // skip now (no box holds one since plan 28, 4.6). A match
      // rolls from this player's own draw stream, on the catch-up table for how far behind the other
      // player they are (catchUpTier: double bean odds from 10 pipes, a guaranteed bean3 from 25).
      const pairsLeft = this.finishSpawned ? 0 : skipPairs(this.pipesPassed, this.level, this.tune);
      const other = this.match?.slots[this.player === 1 ? 1 : 0];
      const draws = this.match ? catchUpDraws(catchUpTier((other?.pipesPassed ?? 0) - this.pipesPassed, T), T) : T.mystery.draws;
      const pair = itemPair ?? this.pipesSpawned;
      const draw = rollMystery(this.match ? this.rngDraw : this.course.reward(pair), T, draws);
      this.openMystery(this.dailyDraw(resolveMystery(draw, { beans: this.effects.beans(), pairsLeft: this.runIsDaily ? 0 : pairsLeft }, T)), x, y);
    } else if (kind === 'question') {
      this.offerSuperQ();
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
    const prices = this.shopPrices();
    if (!canBuy(id, { coins: this.purseCoins(), beans: this.effects.beans(), prices }, T)) return false;
    if (!this.testCoins()) this.effects.spendCoins(prices[id]);
    if (id === 'fiber') this.eatFiber();
    else if (id === 'bean') this.giveBeans(1);
    else if (id === 'superBean') this.giveBeans(T.beans.superBeans);
    else if (id === 'mystery') {
      this.runBoxesBought = (this.runBoxesBought ?? 0) + 1; // 🎰
      const draw = resolveMystery(rollMystery(this.match ? this.rngDraw : this.course.rng, T), { beans: this.effects.beans(), pairsLeft: 0 }, T);
      if (opts.reel) this.spinReel(draw, opts);
      else this.openMystery(draw, opts.x, opts.y, opts);
    }
    this.refreshCoinHud();
    this.playSample('coin-spend', T.coinSpendVolume, sfx.pickup);
    this.statCall('shopBuy');
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

  /** The 🏅 Bracket pill shows in a tournament race's level break once both halves have reached the line (Versus.bothInBreak), the shop closed. */
  bracketButtonShown() {
    if (!this.bracketButton || !this.levelBreak || this.state !== 'paused' || this.shopOpen) return false;
    return Boolean(this.versusHost()?.bothInBreak?.());
  }

  refreshBracketButton() {
    this.bracketButton?.setVisible(this.bracketButtonShown());
  }

  /** The 🏅 pill: the bracket read-only over the match (the panel's peek view). */
  openBracketPeek() {
    if (!this.bracketButtonShown()) return;
    this.focus?.hide();
    this.versusHost()?.openPeek?.();
  }

  /**
   * The shop's prices now: shop.prices, or in an education run the level's (eduShopPrices): the
   * highest level the run has reached (plan 26, A2, Michael's choice), so going back to an easy level
   * never makes the shop cheaper; in a break that is at least the level about to be played.
   */
  shopPrices() {
    return this.runIsEducation ? eduShopPrices(Math.max(this.level, this.runTopLevel ?? 0)) : T.shop.prices;
  }

  /** The 📚 pill shows in an education run's level break, the shop and the quiz closed. */
  quizButtonShown() {
    return Boolean(this.quizButton && this.runIsEducation && this.levelBreak && this.state === 'paused' && !this.shopOpen && !this.quizOpen);
  }

  /**
   * The 📚 Review pill, and under it what this break's quiz can still ask, as three coloured
   * numbers (new, missed, review; quizCounts), 0 · 0 · 0 included. No numbers in a test run.
   */
  refreshQuizButton() {
    if (!this.quizButton) return;
    const shown = this.quizButtonShown();
    const counts = shown ? this.quizCounts({ mode: 'break' }) : null;
    // The gate read again here, so the level choice below never reads a cache from before the quiz
    // (AUD-025: onQuizClosed and refreshPurse redraw the pills before the banner).
    const gated = this.refreshGate(counts);
    this.quizButton.setText(`${EDUCATION_EMOJI} ${t(this.locale, 'reviewPill')}`).setVisible(shown);
    this.quizButton.pulse(shown && gated);
    if (counts) this.quizCountLine.set(counts);
    this.quizCountLine.setVisible(shown && Boolean(counts));
    this.quizCountChip?.setVisible(shown && Boolean(counts));
    if (this.breakQuitButton) {
      const due = this.breakGated(counts); // the gate's own rule (none with test mode on)
      const armed = this.breakQuitArmed();
      // One word, Quit, cards due or not (plan 26, A2); armed, it says when the second tap ends the run ungraded.
      this.breakQuitButton.setText(t(this.locale, armed ? (due ? 'breakQuitDueSure' : 'breakQuitSure') : 'breakQuit')).setVisible(shown);
    }
    if (this.breakLevelPick != null && !this.levelPickOffered()) this.dropLevelPick(); // the gate came back, or test mode turned on
    this.refreshLevelPickUi();
  }

  /**
   * The level choice at an education break (plan 26, A2: Michael's image 12): [◀] LV n [▶] once nothing
   * is missed or due (breakGate, kept by refreshGate), never in a test run (or with test mode
   * on) or a match. It cycles 1 … the higher of the next level and the levels unlocked, wrapping
   * (nextEduStartLevel). Only the preview follows it during the break (the banner's title, the bar's
   * label, the background): the quiz, the tally, the shop and Skip keep reading the run's level, so a
   * choice cannot make them cheap. endLevelBreak applies it (applyLevelPick). null: the next level.
   */
  levelPickOffered() {
    return Boolean(this.levelBreak && this.runIsEducation && !this.runIsTest && !this.isTestMode() && !this.match && !this.breakGate);
  }

  /** The choice shows: offered, and the break's own buttons show (no shop or quiz over them). */
  levelPickShown() {
    return this.levelPickOffered() && this.quizButtonShown();
  }

  /** The level the break shows: the one chosen, else the next one (this.level). */
  breakShownLevel() {
    return this.breakLevelPick ?? this.level;
  }

  /** ◀ (-1) or ▶ (+1): the next choice, wrapping; the preview follows. */
  stepBreakLevel(step) {
    if (!this.levelPickShown()) return;
    // The gate is cached per break event (refreshGate): a card may have come due since it was read, so a
    // press reads it again first; a gate back drops the choice and hides it (AUD-057).
    if (this.refreshGate()) {
      this.refreshShopButton(); // as a refused continue: Review pulses, the counts and Quit's words follow, the choice is dropped and hidden
      return;
    }
    const top = Math.min(Math.max(this.level, this.eduStore.load().unlockedLevel), LEVELS.length);
    const next = nextEduStartLevel(this.breakShownLevel(), step, top);
    this.breakLevelPick = next === this.level ? null : next;
    this.showLevelPick();
  }

  /** The choice withdrawn (no longer offered): the preview back to the next level. */
  dropLevelPick() {
    this.breakLevelPick = null;
    this.showLevelPick();
  }

  /** The preview of the level shown: the banner's title, the bar, the background, the choice's label. */
  showLevelPick() {
    this.refreshLevelBanner();
    this.refreshLevelBar();
    this.fadeBackground(this.breakShownLevel());
    this.refreshLevelPickUi();
  }

  refreshLevelPickUi() {
    if (!this.levelPickLabel) return;
    const shown = this.levelPickShown();
    this.levelPickDown.setVisible(shown);
    this.levelPickUp.setVisible(shown);
    this.levelPickLabel.setText(levelLabel(this.locale, this.breakShownLevel())).setVisible(shown);
  }

  /**
   * At the end of a break with a level chosen (endLevelBreak, after the next level unlocks): the run
   * goes on from that level's first pair (testRunStart gives the pairs before it), forward or back.
   * Both pipe counters reset together, since the finish line needs pipesSpawned to equal the level's
   * end exactly; a pair still on the field is counted as passed, so it scores nothing into the new
   * count. The score is left as it is, and the run is no longer full (no 💯 / 🤓). The bean guarantee
   * is left alone. A replayed level plays and pays as that level always does.
   */
  applyLevelPick() {
    const pick = this.breakLevelPick;
    this.breakLevelPick = null;
    if (pick != null && pick !== this.level) {
      const begin = testRunStart(pick, this.tune);
      this.statCall('skip', begin.pipes - this.pipesPassed); // pairs passed over, never flown (a pick back skips none)
      this.level = begin.level;
      this.statCall('level', this.level);
      this.pipesPassed = begin.pipes;
      this.pipesSpawned = begin.pipes;
      this.runSkipped = true;
      for (const pipe of this.pipes?.getChildren?.() ?? []) if (pipe.getData('scoring')) pipe.setData('passed', true);
    }
    this.runTopLevel = Math.max(this.runTopLevel ?? 0, this.level);
  }

  /** Is Quit armed (its first tap less than saveClearConfirmMs ago)? */
  breakQuitArmed() {
    return this.breakQuitArmedAt != null && this.time.now - this.breakQuitArmedAt < T.saveClearConfirmMs;
  }

  /**
   * Quit at an education break (plan 25, B8): the first tap arms it, a second inside the confirm time
   * ends the run. With the gate open, it ends as a normal run, graded on its answers; while the gate
   * holds (new cards included since plan 28, Stage 3b) it counts as quitting the run (breakGaveUp: no
   * grade, the 🤓 streak untouched), and so does a
   * Quit with nothing answered (plan 26, A2), so 🏳️'s "Quit a run without answering a single question"
   * holds for this Quit as for a revive's. A run with no answers is never graded, so nothing else moves.
   */
  breakQuitTap() {
    if (!this.quizButtonShown()) return;
    if (!this.breakQuitArmed()) {
      this.breakQuitArmedAt = this.time.now;
      this.refreshShopButton();
      this.time.delayedCall(T.saveClearConfirmMs + 50, () => this.refreshShopButton());
      return;
    }
    const counts = this.quizCounts({ mode: 'break' });
    const due = this.breakGated(counts); // the gate holds, new cards included (plan 28, Stage 3b: Michael's call 1); none with test mode on
    this.breakGaveUp = due || !((this.runQuiz?.answered ?? 0) > 0);
    this.breakQuitArmedAt = null;
    this.breakLevelPick = null;
    this.levelBreak = false;
    this.levelTitle?.setVisible(false);
    this.levelHint?.setVisible(false);
    this.levelHintGlow?.setVisible(false);
    this.endRun();
    this.refreshShopButton();
    this.showOver();
  }

  /**
   * Does a break's gate hold on these counts (plan 28, Stage 3b)? A new, missed or review card is left
   * that the gate asks: quizCounts({ mode: 'break' }) is already within the break's two limits.
   */
  gateHolds(counts) {
    return Boolean(counts) && counts.new + counts.missed + counts.review > 0;
  }

  /**
   * The gate (plan 25, B6; every break since plan 26): an education run's level break holds until it
   * has asked its new cards (up to the player's N a visit) and its due cards (missed or reviews due now,
   * up to education.duePerBreak, the most urgent first), and every card missed in this break is
   * answered right (plan 28, Stage 3b: every break asks its cards). Never in a test run or a match.
   * resumePlay holds the break while it is true; Skip (a due card goes to tomorrow, a new one until
   * tomorrow) and Quit are the other ways out.
   */
  breakGated(counts) {
    // Nor with test mode on (it can be turned on mid-run): nothing is saved, so nothing it asks could clear.
    if (!this.levelBreak || !this.runIsEducation || this.runIsTest || this.isTestMode?.() || this.match) return false;
    return this.gateHolds(counts ?? this.quizCounts({ mode: 'break' })); // the counts the caller already read, else the store's
  }

  /**
   * The gate's cache (breakGate), read again for this break event: breakGated reads the store, so it
   * is never read per frame. levelPickOffered and syncLevelHint read the cache. Both writers go
   * through here (refreshLevelBanner, refreshQuizButton; AUD-025), so the gate's line (gateTapped)
   * goes whenever the gate is found open. counts: quizCounts({ mode: 'break' }) if the caller has it.
   */
  refreshGate(counts) {
    this.breakGate = this.breakGated(counts);
    if (!this.breakGate) this.gateTapped = false; // the gate opened: its line goes
    return this.breakGate;
  }

  /**
   * A card's Skip (plan 26, A2; a gate's Bury in plan 25, B7): 3 × the level just cleared
   * (education.buryCoinsPerLevel), counted from the highest level the run has reached, as the shop is.
   */
  buryPrice() {
    return T.education.buryCoinsPerLevel * Math.max(1, Math.max(this.level, this.runTopLevel ?? 0) - 1);
  }

  /**
   * Skip a card (plan 26, A2; it replaced Bury and the level Skip ▸): in an education run's level
   * break, the card on show moves on for buryPrice() corn (3 × the level cleared). A due card (one
   * missed in this break, or a stored record due now: it holds the gate) also goes to tomorrow
   * (eduStore.bury until skipUntil: 24 h, or the next local midnight if later), leaves breakMissed and counts toward education.buryPerDay; a
   * practice card stays out of practice for the rest of the local day (eduStore.skipPractice: its
   * schedule untouched, not counted; AUD-028), and a new card is not offered again that day
   * (eduStore.skipNew) and takes one of the break's new cards (plan 28, Stage 3b); neither has a daily limit. A test run's Skip is free and saves
   * nothing. A skip is no answer: no tally, no pilot event. The quiz's right slot shows it (offerSkip).
   */
  skipFree() {
    return Boolean(this.runIsTest || this.isTestMode());
  }

  /** What a Skip costs now: buryPrice(), or 0 in a test run. */
  skipPrice() {
    return this.skipFree() ? 0 : this.buryPrice();
  }

  /** Is card `cardId` due now: missed in this break, or a stored record due (it holds the gate)? */
  cardDue(cardId) {
    if ((this.breakMissed ?? []).includes(cardId)) return true;
    const rec = this.eduStore.load().cards[cardId];
    return Boolean(rec) && rec.dueAt <= Date.now();
  }

  /** What stops a Skip of card `cardId`: 'none' (no Skip here: not an education run's level break, or a match), 'cap' (a due card, the day's skips used), 'coins' (the purse is short), or null. */
  skipBlocker(cardId) {
    if (!this.levelBreak || !this.runIsEducation || this.match) return 'none';
    if (this.skipFree()) return null;
    if (this.cardDue(cardId) && this.eduStore.buriedOn(localDayKey()) >= T.education.buryPerDay) return 'cap';
    if (this.effects.coins() < this.buryPrice()) return 'coins';
    return null;
  }

  /** Skip card `cardId` (the quiz then shows the next one): true when it was skipped. */
  skipCard(cardId) {
    if (this.skipBlocker(cardId)) return false;
    if (this.skipFree()) return true;
    const due = this.cardDue(cardId);
    const retry = (this.breakMissed ?? []).includes(cardId);
    this.effects.spendCoins(this.buryPrice());
    if (due) {
      this.eduStore.bury(cardId, skipUntil(Date.now()), localDayKey()); // tomorrow: 24 h, or the next midnight on a 25-hour day (AUD-029)
      this.breakMissed = (this.breakMissed ?? []).filter((id) => id !== cardId);
      if (!retry) this.breakDueAsked = (this.breakDueAsked ?? 0) + 1; // one of the gate's due cards (plan 28, Stage 3b)
    } else if (this.eduStore.load().cards[cardId]) {
      this.eduStore.skipPractice(cardId, localDayKey()); // out of practice for the day (AUD-028)
    } else {
      this.eduStore.skipNew(cardId, localDayKey()); // not offered again today, and one of the break's new cards (plan 28, Stage 3b)
      this.breakNewAsked = (this.breakNewAsked ?? 0) + 1;
    }
    this.refreshCoinHud?.();
    this.refreshLevelBanner();
    this.refreshShopButton();
    return true;
  }

  /**
   * What the numbers under Review mean (plan 25, B4): the "Your cards" lines with this break's
   * counts, on the same info card ("Waiting in this quiz"). It opens on the tap's release
   * (openEduCardOnRelease) or A on its ring item; any tap, key or pad press closes it, and nothing
   * under it is pressed: the break does not continue.
   */
  toggleBreakCounts() {
    if (!this.eduCard) return;
    if (this.eduCard.open) {
      this.eduCard.hide();
      return;
    }
    const counts = this.quizButtonShown() ? this.quizCounts({ mode: 'break' }) : null;
    if (!counts) return;
    this.eduCard.show({ glyph: EDUCATION_EMOJI, title: t(this.locale, 'quizCountsTitle'), lines: countLines(this.locale, counts) });
  }

  /** The shop pill (the corn kernel and the purse): shown by shopButtonShown, dimmed (trayAlpha) when the purse is empty. The 🏅 and 📚 pills under it are refreshed with it. */
  refreshShopButton() {
    this.refreshBracketButton();
    this.refreshQuizButton();
    if (!this.shopButton) return;
    const coins = this.purseCoins();
    // "Shop" beside the kernel, no number (plan 26, A2: the HUD shows the purse); dimmed at 0 corn.
    this.shopButton.setText(t(this.locale, 'shopPill')).setAlpha(coins > 0 ? 1 : T.trayAlpha).setVisible(this.shopButtonShown());
  }

  /**
   * The shop pill's place for the run about to start (plan 26, A2): in an education run's row (left of
   * Review: eduBreakLayout's shop), else centred under the banner (normal runs and test runs at y 800,
   * under the poop at mid-height, plan 28 5.1; a match's half at y 720, where it always was). The box object is kept, since the ring and the tap test hold it: it is
   * moved in place, and the pill (drawn once, at its box: createButton) is drawn again on it.
   */
  placeShopPill(education) {
    if (!this.shopButtonBox || !this.col) return; // no pill on this scene (a test's bare scene)
    const want = education && this.eduBreakBoxes ? this.eduBreakBoxes.shop : shopButtonLayout(this.col.width, GAME_HEIGHT, T, this.col.x, { match: Boolean(this.match) });
    const box = this.shopButtonBox;
    if (box.x === want.x && box.y === want.y && box.width === want.width && box.height === want.height) return;
    Object.assign(box, { x: want.x, y: want.y, width: want.width, height: want.height });
    this.shopButton?.destroy();
    this.shopButton = createButton(this, box, t(this.locale, 'shopPill'), { ...TEXT_STYLE, fontSize: '40px' }, { depth: 27, icon: { key: 'coin', px: 48 } }).setVisible(false);
  }

  /** Open the shop panel (the 💰 in a level break): the rows, the purse, the open sound. */
  openShop() {
    if (this.shopOpen || !this.shopButtonShown()) return;
    this.statCall('shopOpen');
    const L = this.shopBoxes;
    const nameStyle = { ...TEXT_STYLE, fontSize: '32px' };
    const panel = this.add.rectangle(L.panel.x, L.panel.y, L.panel.width, L.panel.height, 0x1a0b14, 0.95).setStrokeStyle(8, 0xe85e96).setDepth(27).setScale(0.8);
    const tween = this.tweens.add({ targets: panel, scale: 1, duration: T.shop.panelInMs, ease: 'Back.easeOut' });
    const closeText = this.add.text(L.close.x, L.close.y, '\u2715', { ...TEXT_STYLE, fontSize: '48px' }).setOrigin(0.5).setDepth(29);
    const title = this.add.text(L.title.x, L.title.y, '', { ...TEXT_STYLE, fontSize: '48px', color: '#f8a0c8' }).setOrigin(0.5).setDepth(28);
    const coins = createCoinText(this, L.coins.x, L.coins.y, { ...TEXT_STYLE, fontSize: '36px' }, { depth: 28, px: 44 }); // "Your coins", the kernel, the purse
    const icons = { fiber: 'fiber', bean: 'bean', superBean: 'bean', mystery: 'mystery-icon' };
    const rows = {};
    for (const row of L.rows) {
      const button = createButton(this, row, '', nameStyle, { depth: 28 });
      const icon = this.add.image(row.iconX, row.y, icons[row.id]).setDisplaySize(row.icon, row.icon).setDepth(29);
      const extra = row.id === 'superBean' ? this.add.text(row.iconX + row.icon / 2 - 4, row.y + 18, `×${T.beans.superBeans}`, { ...TEXT_STYLE, fontSize: '28px' }).setOrigin(0.5).setDepth(29) : null;
      const name = this.add.text(row.nameX, row.y, '', nameStyle).setOrigin(0, 0.5).setDepth(29);
      const price = createCoinText(this, row.priceX, row.y, nameStyle, { align: 'right', depth: 29, px: 40 }); // the kernel and the price, or "Bag full"
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
    this.shop.coins.set(t(this.locale, 'shopCoins'), countText(coins));
    const prices = this.shopPrices();
    for (const row of this.shopBoxes.rows) {
      const r = this.shop.rows[row.id];
      const blocker = buyBlocker(row.id, { coins, beans, prices }, T);
      // A full bag reads "Bag full" even with the purse short too: coins would not help.
      const bagFull = buyBlocker(row.id, { coins: Infinity, beans, prices }, T) === 'full';
      r.price.setIcon(!bagFull).set('', bagFull ? t(this.locale, 'shopFull') : countText(prices[row.id]));
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
    // 🃏 four boxes in a row with the same reward (the draw as it opens: field, shop or reel).
    this.drawStreak = nextDrawStreak(this.drawStreak, draw);
    if (this.drawStreak.streak >= FOUR_OF_A_KIND) this.fourOfAKind = true;
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
    this.spawnFinishLine(this.finishLeadShift());
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
    // Nor, before its public release, does an education run (plan 21): its cards were saved answer by
    // answer; no best, top list, career counters or career badges. Its own badges and average grade
    // (plan 22) stay on this device with the cards (recordEducation). A won run waits (plan 26): its
    // bonus answers count, so it is recorded once its game-over panel is left (finishPendingEducation),
    // and the panel shows the badges it would earn so far. The sync still runs, for what was already
    // queued (plan 25, A1): a tester's answers, the 📚 board's grades, an earlier run's best or
    // counters; nothing of this run is in it.
    if (this.runIsEducation) {
      if (this.won) {
        const facts = this.eduFactsNow();
        this.eduStore.setPending({ tally: { ...this.runQuiz }, full: facts.full, caughtUp: facts.caughtUp, at: Date.now() });
        this.runBadges = this.eduPreviewBadges(facts);
      } else this.recordEducation();
      this.syncLeaderboard();
      return;
    }
    this.queueRunSummary(); // plan 30: the run's summary, sent with the next sync
    // A Daily Dump records only itself: the attempt is final and its score queued for the 🌞 board,
    // never the 🏆 top list or best (an endless score above maxScore would stop every 🏆 post).
    if (this.runIsDaily) {
      const rec = this.saveDailyAttempt(true);
      if (rec) this.dailyQueue.add({ ...rec, name: this.save?.name ?? null });
      this.recordCareer('daily');
      this.dailySync = this.syncLeaderboard();
      return;
    }
    // A new personal best (Over says so, on screen only): above every score this player had, of
    // either kind, before this one is recorded.
    const prevBest = Math.max(this.best.load(), ...(this.save?.top ?? []).map((e) => e?.score ?? 0));
    this.personalBest = this.score > 0 && this.score > prevBest;
    this.best.save(this.score); // legacy store, kept for first-run seeding
    this.save = saveLocal(recordScore(this.save, this.score, { toilet: this.toilet, level: this.level }));
    this.recordCareer('single');
    this.syncLeaderboard(); // fire and forget; never awaited inside the update loop
  }

  /**
   * One finished education run into this device's education record (plan 22): the 🤓 streak moves, a
   * graded run's grade joins the average, and the education badges the run earns (EDU_ACHIEVEMENTS,
   * judged on the record's counters) are held there and listed on Over (this.runBadges). The career
   * store, which uploads what it holds, never sees any of it; the record leaves the device only when
   * the player shares it on the 📚 board (drainEduShare). Never a test run (endRun returns before).
   */
  recordEducation(facts = this.eduFactsNow()) {
    const day = utcDayKey();
    const counters = this.eduStore.endRun(facts);
    const earned = evaluate({ totals: counters, facts, unlocked: this.eduStore.load().badges, day, catalog: EDU_ACHIEVEMENTS });
    this.runBadges = this.eduStore.unlock(earned, day);
  }

  /** This run's education facts (eduRunFacts): its tally, whether it ended on a Quit that counts as quitting (a revive's, or the break's while its gate holds or with nothing answered: gaveUp), whether it was full (from level 1, nothing skipped, won), won, and for a won run whether nothing is due now (caughtUp, 🤓: plan 34). */
  eduFactsNow() {
    const won = Boolean(this.won);
    return eduRunFacts(this.runQuiz, { gaveUp: Boolean(this.revive?.gaveUp || this.breakGaveUp), full: this.runStartLevel === 1 && !this.runSkipped && won, won, caughtUp: won && this.eduCaughtUp() }, T);
  }

  /**
   * All caught up on cards (plan 34, 🤓 Nerd Alert; Michael: nothing due): no missed card and no review
   * due now on this device. Unseen cards and reviews due later do not count; a card skipped today waits
   * past today (skipUntil), so it is not due.
   */
  eduCaughtUp(now = Date.now()) {
    // A card missed in this run's challenge question costs corn only (plan 34): it never blocks 🤓.
    const c = cardCounts(this.eduStore.load().cards, { context: 'all', now, exclude: this.superQMissed ?? [] });
    return c.missed + c.review === 0;
  }

  /** The education badges a run with `facts` would earn if recorded now (plan 26: a won run's panel, before it is recorded). Nothing is stored. */
  eduPreviewBadges(facts) {
    const state = this.eduStore.load();
    return evaluate({ totals: countersAfterRun(state.counters, facts), facts, unlocked: state.badges, day: utcDayKey(), catalog: EDU_ACHIEVEMENTS });
  }

  /**
   * A won education run waiting since its game-over panel (plan 26), recorded now: when the panel is
   * left (Home and Play again restart this scene) or at the next page load. Once: the store hands it
   * over (takePending). Returns whether one was recorded.
   */
  finishPendingEducation() {
    const p = this.eduStore?.takePending();
    if (!p) return false;
    this.recordEducation(eduRunFacts(p.tally, { gaveUp: false, full: p.full, won: true, caughtUp: p.caughtUp }, T));
    this.runBadges = null; // this scene's next run starts with none
    return true;
  }

  /**
   * After the bonus quiz (plan 26): its answers are part of the won run, so the game-over panel is
   * drawn again with the run's numbers, its "This run" rows and the badges it would earn now (a
   * wrong answer can take 💯 back off). The waiting run in the store follows each answer (quizAnswer).
   */
  refreshOverEducation() {
    const over = this.scene.get('Over');
    if (!this.overData?.education || !over?.scene.isActive()) return;
    if (this.overData.education.answered === this.runQuiz.answered) return;
    const pending = !this.runIsTest && this.eduStore.load().pending;
    this.overData = { ...this.overData, education: { ...this.runQuiz }, badges: pending ? this.eduPreviewBadges(eduRunFacts(pending.tally, { gaveUp: false, full: pending.full, won: true, caughtUp: pending.caughtUp }, T)) : this.overData.badges };
    over.scene.restart(this.overData);
  }

  /**
   * One finished run into the career (plan 08): a normal single-player run or a Daily Dump, never a
   * test run or a match half (endRun returns before). Its counters wait in the career store for the
   * next sync; the badges it earns (judged on this device's totals) are unlocked here and listed on
   * Over (this.runBadges), their claims queued.
   */
  recordCareer(mode) {
    const day = utcDayKey();
    // Pipes passed: fart and skipped pairs included (as for levels); a Daily Dump counts only the pairs flown that day.
    const pipes = mode === 'daily' && this.daily ? Math.max(0, this.pipesPassed - this.daily.startPipes) : this.pipesPassed;
    const facts = { mode, score: this.score, level: this.level, won: Boolean(this.won), toilet: Boolean(this.toilet), collected: { ...this.collected }, farts: this.runFarts ?? 0, superFarts: this.runSuperFarts ?? 0, pipes, falls: this.runFalls ?? 0, closeCalls: this.runCloseCalls ?? 0 };
    facts.ceilingHits = this.runCeilingHits ?? 0;
    facts.boxesBought = this.runBoxesBought ?? 0;
    facts.closeShave = mode === 'single' && levelCloseShave(this.closeCallsByLevel, (lv) => levelPipes(lv, this.tune));
    facts.fourOfAKind = Boolean(this.fourOfAKind);
    const now = Date.now();
    const { prevRunAt, winTimes } = this.careerStore.markRun(now, mode === 'single' && Boolean(this.won));
    facts.daysSinceLastRun = daysBetween(prevRunAt, now); // 🧱 null on this device's first run
    facts.winsLast7Days = winsInWindow(winTimes, now); // 🏃
    this.careerStore.addRun(runDeltas(facts));
    if (mode === 'single') this.streakStore.played('single', localDayKey(new Date(now))); // the Singleplayer streak, on local days (plan 34)
    const earned = evaluate({ totals: this.careerStore.totals(this.save?.id ?? null), facts, unlocked: this.careerStore.unlocked(), day });
    this.runBadges = this.careerStore.unlock(earned, day);
  }

  /**
   * Badges earned without a run to show them on: the score and level badges the saved top list
   * already reaches (a veteran's, or bests pulled from the board) and lifetime badges on the
   * current totals. Unlocked quietly, their claims queued.
   */
  creditCareer() {
    const day = utcDayKey();
    const earned = evaluate({ totals: this.careerStore.totals(this.save?.id ?? null), facts: bestFacts(this.save?.top), unlocked: this.careerStore.unlocked(), day });
    this.careerStore.unlock(earned, day);
  }

  /**
   * Send the career for player `id`: the batch of counters (resent unchanged until the board has it;
   * its answer is the player's totals across every device), lifetime badges on those totals, then
   * the claims. Never rejects, so the score posts after it always run.
   */
  async drainCareer(id) {
    try {
      const batch = this.careerStore.beginBatch(newId);
      if (batch) {
        const res = await this.postCounters(id, batch.batch, batch.counters);
        if (res?.status === 'ok') this.careerStore.confirmBatch(batch.batch, res.totals, id);
        else if (res?.status === 'rejected') this.careerStore.dropBatch(batch.batch);
      }
      if (this.save?.id === id) this.creditCareer();
      const claims = this.careerStore.claims().slice(0, 50);
      if (!claims.length) return;
      const out = await this.claimBadges(id, claims);
      if (out === 'rejected') this.careerStore.dropClaims(claims);
      else if (out) this.careerStore.settleClaims(out.stored, out.closed);
    } catch {
      /* the next sync tries again */
    }
  }

  /**
   * Open a profile (plan 08): { name } for the player a board shows under that name, nothing for
   * this device's own player. From the save panel (own) or a tapped board name (anyone's).
   */
  openStats(target = null) {
    this.statsTarget = target?.name ? { name: target.name } : null;
    this.handleChrome('stats');
  }

  /**
   * The 📚 board (plan 21, Stage 3b): send what the board does not have yet of this device's
   * education record (graded runs, their grade sum, badges) for player `id`, when that player
   * shares. First the name, if it changed here (rename_education never adds a player: false means
   * sharing was stopped elsewhere). Then one batch (the server takes one per 5 s; a long record goes
   * over several syncs). 'restart': the row is another round's (sharing was stopped and started
   * again on another device), so this device takes that round and sends its whole record again, at
   * once. 'notShared': sharing was stopped elsewhere, so it stops here. With nothing new to send, one
   * empty batch per page load (the probe; the registry's eduRoundProbed, set once the server answered)
   * asks whether the round is still this one, so a device learns of a new round without a new run.
   * A test run adds nothing to the record, so nothing of it is ever sent. Never rejects.
   */
  async drainEduShare(id) {
    try {
      const share = this.eduShare.load();
      if (!share.on || this.save?.id !== id) return;
      const name = this.save.name;
      if (name && share.name !== name) {
        const renamed = await this.postEduRename(id, name);
        if (renamed === false) {
          this.eduShare.turnOff();
          return;
        }
        // 'nameTaken' or 'rejected': the board keeps the name it has; this one is not sent again.
        if (renamed !== null) this.eduShare.setName(name);
      }
      for (let turn = 0; turn < 2; turn += 1) {
        // The board's view of the record (boardRecord): the runs played on this device, never restored ones (plan 28, 3.1a).
        const batch = this.eduShare.beginBatch(boardRecord(this.eduStore.load()), newId);
        if (!batch) {
          // Nothing new to send. Once a page load, ask whether the row is still this device's round
          // (plan 24, AUD-009): a fold of two sharers, or Stop and Share on another device, starts a
          // new one, and this device's whole record must go into it. The flag lives in the game's
          // registry (it outlives a scene restart, not a reload) and is set once the server answered.
          if (this.registry?.get?.(EDU_ROUND_PROBED)) return;
          const probe = await this.postEduGrades(id, newId(), { sharedAt: this.eduShare.load().sharedAt, runs: 0, gradeSum: 0, badges: {} });
          if (['ok', 'restart', 'notShared', 'rejected'].includes(probe?.status)) this.registry?.set?.(EDU_ROUND_PROBED, true);
          if (probe?.status === 'restart') {
            this.eduShare.restart(probe.sharedAt);
            continue;
          }
          if (probe?.status === 'notShared') this.eduShare.turnOff();
          return;
        }
        const res = await this.postEduGrades(id, batch.batch, { sharedAt: this.eduShare.load().sharedAt, runs: batch.runs, gradeSum: batch.gradeSum, badges: batch.badges });
        if (res?.status === 'restart') {
          this.eduShare.restart(res.sharedAt);
          continue;
        }
        if (res?.status === 'ok') this.eduShare.confirmBatch(batch.batch);
        else if (res?.status === 'notShared') this.eduShare.turnOff();
        else if (res?.status === 'rejected') this.eduShare.dropBatch(batch.batch);
        return;
      }
    } catch {
      /* the next sync tries again */
    }
  }

  /**
   * Is this device's tester in the pilot (plan 21)? Answers are recorded only then. A consent given
   * to an older notice (EDUCATION.consentVersion has moved on) does not count: nothing is sent under
   * a notice the tester has not seen, and the panel asks them to join again.
   */
  researchJoined() {
    return this.consentStore.load()?.version === EDUCATION.consentVersion;
  }

  /** This device's stored pilot consent, of any notice version, or null (the save panel and the Education data panel read it). */
  researchConsent() {
    return this.consentStore.load();
  }

  /**
   * The player id the pilot's calls go under: the one the tester joined with (plan 24, AUD-001),
   * which a user code loaded since may have replaced on this device; the server resolves it through
   * a merge. A consent from before the id was kept falls back to this device's id.
   */
  researchPlayerId() {
    return this.consentStore.load()?.id ?? this.save?.id ?? null;
  }

  /**
   * Send the pilot's queued answer events, one batch a sync (the server takes one per 5 s). 'not
   * enrolled' (the tester withdrew on another device, or the pilot was purged): this device stops
   * recording and forgets the consent; researchEnded tells the panel why. Never rejects.
   */
  async drainResearch() {
    try {
      const id = this.researchPlayerId();
      if (!id || !this.researchJoined()) return;
      const batch = this.researchQueue.beginBatch(newId);
      if (!batch) return;
      const res = await this.postResearch(id, batch.batch, batch.events, this.consentStore.load()?.since ?? null);
      if (res?.status === 'ok' || res?.status === 'rejected') this.researchQueue.confirmBatch(batch.batch);
      else if (res?.status === 'notEnrolled') {
        this.consentStore.clear();
        this.researchQueue.clear();
        this.researchEnded = true;
        this.refreshTestBadge();
      }
    } catch {
      /* the next sync tries again */
    }
  }

  /**
   * Join the pilot (the Education data panel): the invite code and the "I am 18 or older" box go to
   * the server (enrol_research) with the notice's version; the code is not kept. A device with no
   * player id yet gets one here (no username needed). Resolves to { status }: 'ok', 'badInvite',
   * 'closed', 'notAdult', 'rejected' or 'offline'.
   */
  async joinResearch(invite, adult) {
    if (!this.save?.id) this.setSaveState(ensureId(this.save ?? {}));
    const id = this.save.id;
    const res = await this.postResearchEnrol(id, invite ?? null, adult === true, EDUCATION.consentVersion);
    if (res?.status === 'ok' && this.save?.id === id) {
      // No invitation flag: a join is not the 📚 board's invitation, and the server marks none (AUD-040).
      // While joined, the panel shows both parts and the server lets the participant share without a code.
      this.consentStore.join({ version: EDUCATION.consentVersion, phase: res.phase, at: Date.now(), id, since: res.since });
      // Nothing recorded before this join is sent under it (RESEARCH.md: answers given before joining
      // are not sent): a queue left from an older notice's consent goes (plan 24, AUD-005).
      this.researchQueue.clear();
      this.researchEnded = false;
      this.refreshTestBadge();
    }
    return { status: res?.status ?? 'offline' };
  }

  /**
   * Withdraw from the pilot (the Education data panel): the participant and every answer they sent
   * are deleted on the server (delete_research), and this device forgets the consent and its queue.
   * True once the server has none of it; false when it could not be reached, and the tester then
   * stays joined here: the answers are still on the server.
   */
  async leaveResearch() {
    const id = this.researchPlayerId();
    if (id) {
      const gone = await this.postResearchDelete(id);
      if (gone === null) return false;
    }
    this.consentStore.clear();
    this.researchQueue.clear();
    this.refreshTestBadge();
    return true;
  }

  /** enrol_research for the pilot; a method so the smoke can stub it (never the live server). */
  postResearchEnrol(id, invite, adult, consent) {
    return enrolResearch(id, invite, adult, consent);
  }

  /** submit_research_events; a method so the smoke can stub it. */
  postResearch(id, batch, events, since) {
    return submitResearchEvents(id, batch, events, since);
  }

  /** delete_research; a method so the smoke can stub it. */
  postResearchDelete(id) {
    return deleteResearch(id);
  }

  /** Does this device send the player's education grades to the 📚 board? */
  eduShareOn() {
    return this.eduShare.load().on;
  }

  /**
   * Turn sharing on (the Education data panel): the player's name goes on the 📚 board
   * (share_education; `adult` is the panel's "I am 18 or older" box), and this device's record
   * follows with the next syncs. `invite`: the invite code, when the player has one (plan 28, 2.4).
   * Resolves to { status }: 'ok', 'noName' (save a username first), 'closed', 'needsInvite',
   * 'notAdult', 'nameTaken', 'rejected' or 'offline'.
   */
  async startEduShare(adult, invite = null) {
    if (!this.save?.name) return { status: 'noName' };
    if (!this.save.id) this.save = ensureId(this.save);
    const { id, name } = this.save;
    const res = await this.postEduShare(id, name, adult === true, invite);
    if (res?.status === 'needsInvite') this.settings?.set?.({ eduInvited: false }); // the server does not know the invitation: ask for the code again
    if (res?.status === 'ok' && this.save?.id === id) {
      this.settings?.set?.({ eduInvited: true }); // the server knows the player as invited now (plan 28, 2.4)
      this.eduShare.turnOn(res.sharedAt, name);
      this.syncLeaderboard();
    }
    return { status: res?.status ?? 'offline' };
  }

  /**
   * Stop sharing (the Education data panel): the player's row is deleted on the server
   * (unshare_education) and this device stops sending. True once the server has no row; false when
   * it could not be reached, and sharing then stays on here: the row is still on the board.
   */
  async stopEduShare() {
    const id = this.save?.id ?? null;
    if (!id) {
      this.eduShare.turnOff();
      return true;
    }
    const gone = await this.postEduUnshare(id);
    if (gone === null) return false;
    this.eduShare.turnOff();
    return true;
  }

  /**
   * The server says whether this device's player shares (their own profile's `education`, their own
   * row on the 📚 board): a device that did not know turns sharing on and sends its record, and one
   * that still thought so (sharing was stopped elsewhere) turns it off.
   */
  noteEduShared(shared) {
    this.eduShare.noteShared(shared);
  }

  /** The 📚 board's rows (education_board) with this player's own row flagged, from place offset + 1 (plan 28, 5.2: a page); a method so the smoke can stub it. */
  fetchEduBoard(id, offset = 0) {
    return fetchEducationBoard(id, { offset });
  }

  /** share_education for the 📚 board, with the invite code when the player has one; a method so the smoke can stub it (never the live board). */
  postEduShare(id, name, adult, invite = null) {
    return shareEducation(id, name, adult, { invite });
  }

  /** Was this device's player invited to share (plan 28, 2.4)? A flag the panel reads; the code is never kept. */
  eduInvited() {
    return Boolean(this.settings?.load?.().eduInvited);
  }

  /**
   * An invite link's code (main.js keeps it in the registry, out of the address bar): the first ready
   * screen opens the 📚 Education data panel with it filled in, once; nowhere else keeps it.
   */
  openPendingInvite() {
    const code = this.registry?.get('pendingInvite');
    if (!code || this.match || !this.educationAvailable()) return; // kept until a ready screen can open it
    this.registry.remove('pendingInvite');
    this.time?.delayedCall?.(0, () => this.openEduData({ invite: code }));
  }

  /** rename_education; a method so the smoke can stub it. */
  postEduRename(id, name) {
    return renameEducation(id, name);
  }

  /** unshare_education; a method so the smoke can stub it. */
  postEduUnshare(id) {
    return unshareEducation(id);
  }

  /** submit_education_grades; a method so the smoke can stub it. */
  postEduGrades(id, batch, body) {
    return submitEducationGrades(id, batch, body);
  }

  /** submit_counters for the career; a method so the smoke can stub it (never the live board). */
  postCounters(id, batch, counters) {
    return submitCounters(id, batch, counters);
  }

  /** claim_achievements for the career; a method so the smoke can stub it. */
  claimBadges(id, ids) {
    return claimAchievements(id, ids);
  }

  /** A player's profile (player_stats) by { id } or { name }; a method so the smoke can stub it. */
  fetchProfile(who) {
    return fetchPlayerStats(who);
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
    // Its summary was lost with the page: a short row stands behind the score (plan 30).
    if (done && done.playerId) {
      try {
        this.runQueue?.add({ playerId: done.playerId, row: stubRow({ runId: newId(), session: this.runSession(), day: done.day, score: done.score, level: done.level, pipes: done.pipes, version: APP_VERSION }) });
      } catch {
        /* the summary never stops a sync */
      }
    }
  }

  /** The game-over panel after deathToOverMs; `won` swaps its headline, `test` hides Share. A match has no Over: the Versus scene shows the result. */
  showOver(won = false) {
    if (this.match) return;
    this.time.delayedCall(T.deathToOverMs, () => {
      this.physics.pause();
      const daily = this.runIsDaily ? { day: this.dailyRunDay ?? null, level: this.level, playerId: this.save?.id ?? null, practice: this.runIsTest, sync: this.dailySync ?? null } : null;
      const pipes = this.runIsDaily && this.daily ? this.pipesPassed - this.daily.startPipes : this.pipesPassed;
      const personalBest = Boolean(this.personalBest && !this.runIsTest && !this.runIsDaily);
      const badges = this.runIsTest ? [] : [...(this.runBadges ?? [])];
      const education = this.runIsEducation ? { ...this.runQuiz } : null; // the 📚 tally (plan 21)
      // Kept: the bonus quiz draws the panel again with the run's new numbers (refreshOverEducation).
      this.overData = { score: this.score, won, test: this.runIsTest, toilet: this.toilet, level: this.level, pipes, collected: { ...this.collected }, daily, personalBest, badges, falls: this.runFalls ?? 0, closeCalls: this.runCloseCalls ?? 0, education };
      this.scene.launch('Over', this.overData);
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
    this.scaredMs = 0;
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
    this.statCall('death');
    // A match: the crash costs points and a respawn, never the run. An education run (plan 21): the
    // revive quiz decides (startEduRevive). Single player: the run ends, and the coins and every
    // power-up go with it (Over still shows what the run collected).
    if (this.match) this.startRespawn();
    else if (this.runIsEducation) this.startEduRevive();
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
    const respawning = this.state === 'respawn'; // a match, or an education revive
    this.deathTween = this.tweens.add({ targets: this.poop, angle: 180, duration: respawning ? T.versus.respawn.crashMs : T.deathToOverMs, ease: 'Quad.easeIn' });
    if (!respawning) this.showOver();
  }

  /**
   * An education run's crash (plan 21): the coins and power-ups go now (kept in reviveLost for a
   * streak to give back), the world halts as in a match's respawn, and the respawn holds after the
   * tumble for the revive quiz (tickRespawn opens it). What it costs is settled when the quiz ends
   * (reviveDone): game over, or a revive that takes revivePenaltyPerLevel × level points.
   */
  startEduRevive() {
    const lost = this.effects.snapshot();
    this.reviveLost = lost;
    this.effects.spendCoins(this.effects.coins());
    this.clearPowerups();
    this.refreshCoinHud();
    this.revive = reviveStart({ lost: lost.coins > 0 || lost.beans > 0 || lost.probiotic > 0 || lost.postbiotic });
    this.respawnHold = 'quiz';
    this.startRespawn();
  }

  /** The revive quiz moves on: an answer ('correct' / 'wrong'), the choice ('continue' / 'streak') or 'giveUp' (reviveStep). */
  reviveEvent(event) {
    if (!this.revive) return null;
    this.revive = reviveStep(this.revive, event);
    if (this.revive.phase !== 'strikes' && this.revive.phase !== 'over') this.prepareRevive(); // a right answer: the revive is certain
    return this.revive;
  }

  /**
   * An education revive is certain (its first right answer; plan 22, U3): the field ahead clears and
   * refills now, under the quiz card, so the pipes are in place by Fly on and nobody waits for them.
   * Once per revive. Before that the field stays as the crash left it, and so a game over (three
   * misses, or Quit: both come before any right answer) shows the crash, never a fresh field.
   * The world stands still meanwhile (scrollSpeed), and a wide field's pairs sweep in (tickSweep).
   */
  prepareRevive() {
    if (this.respawnFilled || !this.respawning()) return;
    this.respawnFilled = true;
    this.clearFieldAhead();
    this.refillAfterRespawn();
  }

  /** No card left to ask (pickCard null): the revive is granted rather than left without a way on. */
  reviveGrant() {
    if (!this.revive) return null;
    this.revive = { ...this.revive, phase: 'revived' };
    this.prepareRevive();
    return this.revive;
  }

  /**
   * The revive quiz has closed (onQuizClosed): 'over' ends the run (endRun records nothing for an
   * education run; Over follows). 'revived' / 'restored' cost the revive penalty (its −N popup),
   * 'restored' gives back what the crash took, and play goes straight on (plan 22, U3): no "Tap when
   * ready" and no glide; the poop stands at mid-height and blinks for education.reviveBlinkMs
   * (standRevived), then endRespawn starts the field that prepareRevive filled. A run paused under
   * the quiz (pausePlay mid-respawn) is settled all the same, so the quiz's result always takes
   * effect; the resume then carries on from here.
   */
  reviveDone() {
    const phase = this.revive?.phase;
    if (!this.respawning() || this.respawnHold !== 'quiz') return; // the run ended under it (a restart)
    if (phase === 'over') {
      this.respawnHold = null;
      this.respawnPaused = false;
      this.endRun();
      this.showOver();
      return;
    }
    if (phase !== 'revived' && phase !== 'restored') return;
    this.runQuiz.revives += 1;
    if (!this.runIsTest) this.eduStore.addRevive(); // 👼 / 🐦‍🔥 count every revive as it happens; a test run counts nothing
    const per = T.education.revivePenaltyPerLevel;
    this.score = scoreAfterDeath(this.score, this.level, T, per);
    this.scoreText.setText(String(this.score));
    this.showScorePopup('death', 1, 0, this.level, per);
    if (phase === 'restored') {
      this.runQuiz.restores += 1;
      this.effects.restore(this.reviveLost);
      this.refreshCoinHud();
      this.refreshInventory();
      this.refreshProbioticHud();
    }
    this.refreshProbioticHud(); // the score may have lost a digit: re-place the ×2 badge
    this.reviveLost = null;
    this.respawnHold = null;
    this.prepareRevive(); // already done at the right answer; a revive granted some other way gets its field here
    this.standRevived();
  }

  /**
   * Fly on: the poop leaves where it fell for mid-height, upright with its plain face (what the
   * glide ends on, without the glide), and the respawn clock jumps to the last
   * education.reviveBlinkMs of the blinks (respawnBlinkStart). tickRespawn blinks it from there.
   */
  standRevived() {
    this.deathTween?.stop();
    this.deathTween = null;
    this.poop.body.setAllowGravity(false);
    this.poop.setVelocity(0, 0);
    this.respawnFrom = { y: GAME_HEIGHT / 2, angle: 0 };
    this.scaredMs = 0;
    this.refreshPoopLook();
    this.respawnElapsed = respawnBlinkStart(T, T.education.reviveBlinkMs);
    const pose = respawnPose(this.respawnElapsed, this.respawnFrom, T);
    this.poop.y = pose.y;
    this.poop.setAngle(pose.angle);
    this.poop.setAlpha(pose.alpha);
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
    this.respawnFilled = false;
    this.endSweep();
    for (const obj of this.worldObjects()) obj.setVelocityX(0);
    if (!this.match) return; // an education revive (plan 21): what the crash costs is the quiz's to settle (reviveDone)
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
    // An education revive (plan 21) holds at the end of the tumble for its quiz, the poop where it
    // fell. The field ahead clears and refills at the first right answer (prepareRevive; a game
    // over leaves it as it was), and Fly on stands the poop up to blink (reviveDone).
    if (this.respawnHold) {
      this.respawnElapsed = T.versus.respawn.crashMs;
      if (this.respawnHold === 'quiz' && !this.quizOpen) {
        // A revive already decided is settled, never asked again (its quiz would ignore every answer).
        if (reviveSettled(this.revive)) this.reviveDone();
        else this.openQuiz('revive');
      }
      return;
    }
    if (!this.respawnFrom) {
      this.deathTween?.stop();
      this.deathTween = null;
      this.poop.body.setAllowGravity(false);
      this.poop.setVelocity(0, 0);
      this.respawnFrom = { y: this.poop.y, angle: this.poop.angle };
      this.clearFieldAhead();
      this.scaredMs = 0;
      this.refreshPoopLook(); // the plain face back for the ride to mid-screen
      pose = respawnPose(this.respawnElapsed, this.respawnFrom, T);
    }
    this.poop.y = pose.y;
    this.poop.setAngle(pose.angle);
    this.poop.setAlpha(pose.alpha);
    if (pose.phase === 'done') this.endRespawn();
  }

  /** An education revive with every pair of the level already passed: only the finish line is left to fly to (plan 22, F2). */
  reviveAtLevelEnd() {
    return this.runIsEducation && this.pipesPassed >= levelEnd(this.level, this.tune);
  }

  /** How far left of the right edge a finish line stands at the first-pair lead (spawnFinishLine's shift; a skip uses it too). On a phone: 0, the edge. */
  finishLeadShift() {
    return this.fieldW + T.pipeWidth - (this.poopX + pipeLead(this.fieldW, T, FIELD));
  }

  /** Does the finish line still ahead stay through this revive's clear? At a level's end, when it is no farther than the lead. */
  reviveFinishKept() {
    const leadX = this.fieldW + T.levels.finishWidthPx / 2 - this.finishLeadShift();
    return this.reviveAtLevelEnd() && this.finishLine.x <= leadX;
  }

  /**
   * The respawn's clear screen: every pipe, item and bean not yet credited (hasPassed, the
   * scoring rule: fully behind the poop) goes, and a finish line still ahead with it (it spawns
   * again once the level's pairs are done). Credited pairs stay and scroll off. The pair count
   * drops back to the pairs passed, so the cleared pairs come back from the shared course
   * under the same numbers and the level's progress and finish stay in step. An education revive
   * with no pair left in the level keeps a line that is nearer than the first-pair lead
   * (reviveFinishKept), so the line the poop fell in front of is still there after the revive.
   */
  clearFieldAhead() {
    const k = this.kernel;
    const kernelCleared = Boolean(k && !k.done && k.item?.active && !hasPassed(k.item.x, k.item.displayWidth, this.poop.x));
    const sq = this.superQ;
    const bubbleCleared = Boolean(sq && !sq.done && sq.item?.active && !hasPassed(sq.item.x, sq.item.displayWidth, this.poop.x));
    for (const group of [this.pipes, this.items, this.beans]) {
      for (const obj of [...group.getChildren()]) if (!hasPassed(obj.x, obj.displayWidth, this.poop.x)) obj.destroy();
    }
    if (this.finishLine && !this.finishLine.getData('crossed') && !this.reviveFinishKept()) {
      this.finishLine.destroy();
      this.finishLine = null;
      this.finishSpawned = false;
    }
    this.endSweep();
    this.pipesSpawned = this.pipesPassed;
    this.nextGapY = null;
    if (kernelCleared) k.item = null; // the guaranteed kernel comes back with the re-filled stretch (endRespawn)
    if (bubbleCleared) sq.item = null; // so does the challenge bubble (plan 34), on the next pair that can carry it
    this.superQStill = null;
  }

  /**
   * The field after a respawn's clear: the next pair opens at mid-screen, the stretch ahead is
   * pre-filled, and a kernel the clear took is re-armed. A match runs it at the end of its blinks
   * (endRespawn); an education revive at its first right answer, under the card (prepareRevive).
   */
  refillAfterRespawn() {
    this.centreNextGap = true;
    this.nextGapY = null;
    // An education revive at a level's end (plan 22, F2): with no pair left to refill, the cadence
    // would bring the line in a spacing later at the far edge. It stands at the first-pair lead
    // instead (as after a skip), unless a nearer one was kept (clearFieldAhead).
    if (this.reviveAtLevelEnd() && !this.finishSpawned) this.spawnFinishLine(this.finishLeadShift());
    this.prefillPipes();
    // No pair left in the level to carry a cleared kernel: it waits mid-screen, one lead ahead. In
    // an education revive the line is no farther than that, so the kernel waits halfway to it.
    const k = this.kernel;
    if (k && !k.done && !k.item && k.level === this.level && this.pipesSpawned >= levelEnd(this.level, this.tune)) {
      const line = this.reviveAtLevelEnd() && this.finishLine && !this.finishLine.getData('crossed') ? this.finishLine : null;
      const x = line ? Math.max(this.poop.x, (this.poop.x + line.x - T.levels.finishWidthPx / 2) / 2) : this.poopX + pipeLead(this.fieldW, T, FIELD);
      this.markKernel(this.spawnStillCoin(x, GAME_HEIGHT / 2));
    }
  }

  /** The restart after the blinks: like the end of a fart, with the next pair opening at mid-screen and the usual grace. */
  endRespawn() {
    this.poop.setAlpha(1);
    this.poop.setAngle(0);
    this.state = 'playing';
    this.poop.body.setAllowGravity(true);
    this.poop.setVelocityY(0);
    this.graceLeftMs = T.beans.graceMs;
    // An education revive refilled the field under its quiz (prepareRevive); a match refills it now.
    if (this.respawnFilled) this.respawnFilled = false;
    else this.refillAfterRespawn();
    this.applyScroll(); // the field starts (a sweep still running carries on into play)
    if (this.effects.powerReady()) this.setCharged(true);
    this.refreshPoopLook();
    if (!this.match) return; // an education revive: back in play
    const slot = this.match.slots[this.player - 1];
    slot.respawning = false;
    this.publishSlot();
  }

  update(_time, delta) {
    this.syncChrome();
    // A resize that arrived while a run / overlay was up: re-fit as soon as the ready screen is clear.
    if (this.fieldResizeWanted && !this.match && this.canRefitField()) {
      this.fieldResizeWanted = false;
      if (fieldWidth(globalThis.innerWidth, globalThis.innerHeight, FIELD) !== this.scale.width) {
        this.scene.restart(); // create() → applyFieldSize()
        return;
      }
    }
    // ?perf: this frame's physics steps (read before Arcade's postUpdate zeroes them). Single / left half only.
    if (this.scene.key === 'Play') perfSteps(this.physics.world.stepsLastFrame, this.state === 'playing');
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
      if (this.runStatsOn) this.statCall('frame', delta, this.scrollSpeed() * dt);
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
      this.tickSweep(delta, dt);
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
        // ‼️ one long fall per drop past fallLookVy (never while the poop cannot be hurt).
        const fall = fallStarted(this.fallingNow, this.poop.body.velocity.y, T);
        this.fallingNow = fall.falling;
        if (fall.started && this.graceLeftMs <= 0 && !this.testInvincible()) {
          this.runFalls = (this.runFalls ?? 0) + 1;
          this.statCall('fall');
        }
        this.tickScared(delta);
        this.refreshPoopLook(); // the near-miss face, else the falling face past fallLookVy, back to plain / stink on the next flap
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
          if (this.poop.y < top) this.runCeilingHits = (this.runCeilingHits ?? 0) + 1; // ☀️ before die(): endRun counts the run
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

    if (this.state === 'respawn') {
      this.tickSweep(delta, dt); // an education revive's refilled pairs sweep in under its quiz card (no scroll: scrollSpeed is 0)
      this.tickRespawn(delta);
    }
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
        const elapsed = pipe.clockMs + delta;
        pipe.clockMs = elapsed;
        const gapY = gapBobY(elapsed, move.baseY, move.amp, move.periodMs, move.phase, move.holdMs); // rests at each end (pipeMove.holdMs)
        const gapH = pipe.getData('gapH');
        pipe.y = gapY - gapH / 2;
        const mate = pipe.getData('mate');
        if (mate?.active) mate.y = gapY + gapH / 2;
      }
      if (this.state === 'playing' && pipe.getData('scoring') && !pipe.getData('passed') && hasPassed(pipe.x, T.pipeWidth, this.poop.x)) {
        pipe.setData('passed', true);
        perfMark(PERF_TAGS.pipe);
        const mult = this.effects.multiplier(); // read before the countdown: the last postbiotic pipe still counts double
        this.score += pipePoints(T, mult);
        this.pipesPassed += 1;
        if (this.runStatsOn) this.statCall('pipe', this.effects.powerActive());
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
        const elapsed = item.clockMs + delta;
        item.clockMs = elapsed;
        if (bob === 'band') item.y = bobY(elapsed, item.getData('phase'), this.beanBounds, item.getData('period') ?? T.items.fiberPeriodMs);
        else if (bob === 'float') item.y = floatY(elapsed, item.getData('baseY'), T.education.superQ.bobPx, T.education.superQ.bobPeriodMs, item.getData('phase'));
        else if (bob === 'pair') {
          const pair = item.getData('pair'); // the moving pair's top pipe (updated above in this frame)
          if (pair?.active) item.y = pair.y + pair.getData('gapH') / 2;
        } else item.y = gapBobY(elapsed, item.getData('baseY'), item.getData('amp'), T.items.movePeriodMs, item.getData('phase'));
      }
      if (item.x < -T.pipeWidth) item.destroy();
    }
    // The challenge bubble is never missed by a hair (plan 34): reaching the poop's x untouched opens it as a
    // touch would, unless a fart is flying through (it is then gone for the level).
    // A bubble that reaches the poop's x while a fart flies through it is gone for the level (AUD-064): it does
    // not open later, when the fart ends with it still on screen.
    const bubble = this.superQ?.item;
    if (bubble?.active && this.state === 'playing' && !this.superQ.done && bubble.x <= this.poop.x) {
      if (this.effects.powerActive()) this.superQ.done = true;
      else this.collectItem(bubble);
    }
    for (const bean of this.beans.getChildren()) {
      if (this.state === 'playing') {
        const elapsed = bean.clockMs + delta;
        bean.clockMs = elapsed;
        if (!bean.getData('still')) bean.y = beanY(elapsed, bean.getData('phase'), this.beanBounds, T);
        else this.pulseScale(bean, elapsed);
        bean.setAngle(beanAngle(elapsed, T));
      }
      if (bean.x < -T.pipeWidth) bean.destroy();
    }
  }
}

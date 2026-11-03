// Logical playfield. Everything in the scenes is laid out in these units;
// Phaser's Scale Manager fits them to whatever screen the game runs on.
export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

// Tuning knobs. Pixels, seconds, milliseconds. Pure data, safe to import in Node.
export const TUNING = {
  gravity: 2600, // px/s^2 pulling the poop down
  flapVelocity: -760, // px/s applied on tap
  pipeSpeed: 300, // px/s pipes scroll left
  spawnEveryMs: 1500, // time between pipe pairs
  gapHeight: 340, // vertical opening between a pipe pair
  pipeWidth: 128,
  groundHeight: 128,
  gapMargin: 80, // keep the gap this far from the ceiling and the ground
  poopX: 180, // fixed x of the player
  poopRadius: 34, // circular hitbox (~70 % of the 96 logical-px sprite)
  spriteDisplayScale: 0.25, // 384 px textures drawn at 96 logical px
  hudProbioticSize: 96, // logical px; HUD icon uses setDisplaySize
  maxFallAngle: 90, // degrees nose-down at terminal fall
  maxRiseAngle: -25, // degrees nose-up right after a flap
  angleFallRefVy: 1200, // px/s; vy at which fall tilt reaches maxFallAngle
  deathToOverMs: 700, // tumble time before the game-over panel appears
  retryLockoutMs: 400, // ignore taps on the panel for this long so a death tap can't restart
  // Difficulty ramp: from base values at score 0 to the "max" values at rampEndScore, then flat.
  rampEndScore: 30,
  maxPipeSpeed: 400,
  minGapHeight: 260,
  bestKey: 'flappy-poop:best', // localStorage key
  settingsKey: 'flappy-poop:settings', // localStorage key
  vibrateOnDieMs: 60, // ms buzz on death (Android / Chrome only)
  trayHeight: 112, // px band at the bottom reserved for the control tray
  trayAlpha: 0.6, // 0–1 idle alpha of tray buttons
  trayHitMin: 88, // px minimum tray button hit size
  pauseResumeLockoutMs: 300, // ms after resume during which a tap must not flap
  readyButtonRadius: 24, // px corner radius of ready-screen buttons
  readyButtonAlpha: 0.55, // 0–1 fill alpha of ready-screen buttons
  launchSlideMs: 700, // ms the poop slides from its ready spot to poopX on the start tap
  readyPoopScale: 1.33, // × spriteDisplayScale for the speech-bubble poop on the ready screen (shrinks back during the slide)
  toiletOffColor: 0x6a6a6a, // toggle track when off (grey)
  toiletOnColor: 0x8b5a2b, // toggle track when on (brown)
  toiletOffAlpha: 0.33, // 0–1 alpha of the 🚽 while the toggle is off
  toiletKnobMs: 150, // ms the toggle knob takes to slide
  fartVolume: 0.6, // 0–1 Phaser volume for the death fart sample
  items: {
    startScore: 8, // score at which pickups may appear
    hazardStartScore: 15, // score at which bad bacteria may appear
    chancePerGap: 0.3, // 0–1 chance a gap rolls an item
    fiberPoints: 1, // points added by fiber
    bacteriaPenalty: 2, // points subtracted by unshielded bacteria
    probioticPipes: 5, // pipes a probiotic lasts
    itemRadius: 32, // px circular hitbox (~1/3 of the 96 logical-px sprite)
    weights: { fiber: 3, probiotic: 2, bacteria: 4 },
  },
  beans: {
    startScore: 5, // score from which beans may appear
    chancePerGap: 0.09, // 0–1 chance a pipe pair spawns a bean (about fiber's effective ~0.1)
    guaranteeScore: 18, // if no bean has spawned yet, the pair spawned at this score carries one (it reaches the poop ~2 pipes later, i.e. by pipe 20)
    toCharge: 1, // beans needed to ready the fart power
    powerPipes: 5, // pipe pairs that cross the screen during one fart
    powerMs: 4344, // ms; fallback power length = the fart_accelerate clip (the loaded sound's duration wins)
    travelPeriodMs: 4000, // ms for one full up-and-down bob
    travelFrac: 0.5, // 0–1 share of the playable height the bob covers, centred (0.5 = middle half)
    wiggleDeg: 15, // degrees of rotation wiggle about the bean's centre (±)
    wigglePeriodMs: 450, // ms per wiggle cycle
    graceMs: 600, // ms of invulnerability after the fart ends (clears a pipe column at base speed)
    stinkFrameMs: 180, // ms between stink-line frames while charged
    glowMinAlpha: 0.2, // 0–1 white glow pulse floor while charged
    glowMaxAlpha: 0.6, // 0–1 white glow pulse ceiling while charged
    glowPulseMs: 600, // ms per glow pulse (one way)
    fartAlphaMs: 250, // ms per opacity swing (1 → 0.5) while farting
    beanRadius: 32, // px circular hitbox
  },
};

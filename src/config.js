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
  poopRadius: 48, // px circular hitbox = half the 96 logical-px sprite (the whole drawing, square corners excluded)
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
    bacteriaPenalty: 3, // points subtracted by unshielded bacteria (3 since probiotics stack)
    probioticPipes: 5, // pipes a probiotic lasts
    itemRadius: 48, // px circular hitbox = half the 96 logical-px sprite (whole drawing)
    weights: { fiber: 3, probiotic: 2, bacteria: 4 },
  },
  beans: {
    startScore: 5, // score from which beans may appear
    windowEndScore: 20, // end of the "at least one bean" window (scores 5–20)
    chanceInWindow: 0.15, // 0–1 chance per pipe pair inside the window (fiber's effective rate is ~0.10–0.18)
    chanceAfter: 0.06, // 0–1 chance per pipe pair after the window (below fiber's ~0.10)
    guaranteeScore: 17, // if no bean has spawned yet, the pair spawned at this score carries one (on screen ~2 pipes later, by pipe 20)
    toCharge: 1, // beans needed to ready the fart power
    maxBeans: 3, // beans the poop can carry; none spawn or are taken past this
    superBeans: 3, // beans held at activation that make it a super fart
    powerPipes: 5, // pipe pairs that cross the screen during one fart (1–2 beans)
    superPipes: 20, // pipe pairs during a super fart, in the same clip (≈10× base speed at the peak)
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
    centreMs: 300, // ms the poop takes to float to mid-height when the fart starts (gravity off, flaps ignored until it ends)
    endClearMarginPx: 64, // px of extra scroll kept in hand so the last pipe is fully behind the poop when the fart ends
    beanRadius: 48, // px circular hitbox = half the 96 logical-px sprite
  },
};

// Shared leaderboard (Supabase, plain fetch; see db/schema.sql and src/leaderboard.js).
// Both values are copied from the Supabase dashboard and are public by design: they
// ship to every player's browser. The schema's grants are the security boundary.
// An empty dataApi or publishableKey disables the feature (no requests are made).
export const LEADERBOARD = {
  dataApi: 'https://soaakwxspmpcprgyywul.supabase.co/rest/v1', // Data API base URL
  publishableKey: 'sb_publishable_yPcLgM5m3UwiywHuSH2nVA_46Eq1Cle', // sent as the apikey header
  timeoutMs: 4000, // ms before a request is abandoned (the game never waits on it)
  limit: 10, // rows on the board
  storageKey: 'flappyPoop.leaderboard', // localStorage key for the last confirmed submit
  maxScore: 200, // scores above this are not submitted (matches the CHECK in db/schema.sql)
};

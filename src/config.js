// Logical playfield. Everything in the scenes is laid out in these units;
// Phaser's Scale Manager fits them to whatever screen the game runs on.
export const GAME_WIDTH = 360;
export const GAME_HEIGHT = 640;

// Tuning knobs. Pixels, seconds, milliseconds. Pure data, safe to import in Node.
export const TUNING = {
  gravity: 1300, // px/s^2 pulling the poop down
  flapVelocity: -380, // px/s applied on tap
  pipeSpeed: 150, // px/s pipes scroll left
  spawnEveryMs: 1500, // time between pipe pairs
  gapHeight: 170, // vertical opening between a pipe pair
  pipeWidth: 64,
  groundHeight: 64,
  gapMargin: 40, // keep the gap this far from the ceiling and the ground
  poopX: 90, // fixed x of the player
  poopRadius: 17, // circular hitbox (~70 % of the 48 logical-px sprite)
  spriteDisplayScale: 0.25, // 192 px textures drawn at 48 logical px
  maxFallAngle: 90, // degrees nose-down at terminal fall
  maxRiseAngle: -25, // degrees nose-up right after a flap
  deathToOverMs: 700, // tumble time before the game-over panel appears
  retryLockoutMs: 400, // ignore taps on the panel for this long so a death tap can't restart
  // Difficulty ramp: from base values at score 0 to the "max" values at rampEndScore, then flat.
  rampEndScore: 30,
  maxPipeSpeed: 200,
  minGapHeight: 130,
  bestKey: 'flappy-poop:best', // localStorage key
  settingsKey: 'flappy-poop:settings', // localStorage key
  vibrateOnDieMs: 60, // ms buzz on death (Android / Chrome only)
  trayHeight: 56, // px band at the bottom reserved for the control tray
  trayAlpha: 0.6, // 0–1 idle alpha of tray buttons
  trayHitMin: 44, // px minimum tray button hit size
  pauseResumeLockoutMs: 300, // ms after resume during which a tap must not flap
  fartVolume: 0.6, // 0–1 Phaser volume for the death fart sample
  items: {
    startScore: 8, // score at which pickups may appear
    hazardStartScore: 15, // score at which bad bacteria may appear
    chancePerGap: 0.3, // 0–1 chance a gap rolls an item
    fiberPoints: 1, // points added by fiber
    bacteriaPenalty: 2, // points subtracted by unshielded bacteria
    probioticPipes: 5, // pipes a probiotic lasts
    itemRadius: 16, // px circular hitbox (~1/3 of the 48 logical-px sprite)
    weights: { fiber: 3, probiotic: 2, bacteria: 4 },
  },
};

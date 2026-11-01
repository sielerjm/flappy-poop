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
  poopRadius: 17, // circular hitbox (~70 % of the 48 px sprite)
  maxFallAngle: 90, // degrees nose-down at terminal fall
  maxRiseAngle: -25, // degrees nose-up right after a flap
};

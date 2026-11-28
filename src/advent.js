// Christmas (plan 17): the December art the game swaps in while adventSeason holds. Data only. It lives
// outside config.js so that config.js names no asset file (tests/push.test.js stamps a copy of config.js alone).

// The December twins of the stock textures, loaded in season only (Play.loadLazyAudio's
// one flight), never in Boot. `twins` maps a stock key to the key shown while the season holds (seasonalSkin);
// the stock key stays the game's state (Play.poopStockKey), so the race snapshot and the match slot send it and
// each side maps it through its own skin. The fart alternates `fartFrames` on the stink frames' clock; its
// `twins` entry is the first frame (the ghost has no clock). The dead frame has its twin too
// (D13's fallback ended 26 Nov). Every file is a full 'assets/advent/….png' literal, so the service worker precaches it.
export const ADVENT_ART = {
  twins: {
    poop: 'poop-santa',
    'poop-scared': 'poop-scared-santa',
    'poop-stink1': 'poop-stink1-santa',
    'poop-stink2': 'poop-stink2-santa',
    'poop-stink-scared1': 'poop-stink-scared1-santa',
    'poop-stink-scared2': 'poop-stink-scared2-santa',
    'poop-falling': 'poop-falling-santa',
    'poop-stink-falling1': 'poop-stink-falling1-santa',
    'poop-stink-falling2': 'poop-stink-falling2-santa',
    'poop-fart': 'poop-fart-santa1',
    'poop-dead': 'poop-dead-santa',
    'poop-speech': 'poop-speech-santa',
    // The pickups: in the field (1.11) and, since Stage 1c (T12, Michael, 27 Nov: December art everywhere), the HUD, the
    // bean button, Over and the share card, How to play and the shop's rows and reel (seasonIcon); the emoji sites stay.
    fiber: 'candy-cane',
    probiotic: 'gingerbread',
    bean: 'bean-holly', // same bean size and the same hitbox circle, the holly sticks out (Michael, 26 Nov); icons at the stock's scale (T12)
    bacteria: 'bacteria-santa',
  },
  fartFrames: ['poop-fart-santa1', 'poop-fart-santa2'],
  snowCap: 'pipe-snow', // on each bottom pipe's cap, at TUNING.advent.snowCap from the cap's top-left (Play.addSnowCap)
  lights: 'fairy-lights', // tiled along the ceiling villi all December (Stage 1c, 1c.9, T14; Play.refreshLights)
  piece: 'advent', // the Advent piece's texture and pickup kind (Stage 2, 2.6): a December Daily run's one gift, never a twin
  files: {
    'poop-santa': 'assets/advent/poop-santa.png',
    'poop-scared-santa': 'assets/advent/poop-scared-santa.png',
    'poop-stink1-santa': 'assets/advent/poop-stink1-santa.png',
    'poop-stink2-santa': 'assets/advent/poop-stink2-santa.png',
    'poop-stink-scared1-santa': 'assets/advent/poop-stink-scared1-santa.png',
    'poop-stink-scared2-santa': 'assets/advent/poop-stink-scared2-santa.png',
    'poop-falling-santa': 'assets/advent/poop-falling-santa.png',
    'poop-stink-falling1-santa': 'assets/advent/poop-stink-falling1-santa.png',
    'poop-stink-falling2-santa': 'assets/advent/poop-stink-falling2-santa.png',
    'poop-fart-santa1': 'assets/advent/poop-fart-santa1.png',
    'poop-fart-santa2': 'assets/advent/poop-fart-santa2.png',
    'poop-dead-santa': 'assets/advent/poop-dead-santa.png',
    'poop-speech-santa': 'assets/advent/poop-speech-santa.png',
    'candy-cane': 'assets/advent/candy-cane.png',
    gingerbread: 'assets/advent/gingerbread.png',
    'bacteria-santa': 'assets/advent/bacteria-santa.png',
    'bean-holly': 'assets/advent/bean-holly.png',
    'pipe-snow': 'assets/advent/pipe-snow.png',
    bowelidays: 'assets/advent/bowelidays.png', // all December over the title (countdownLine's image)
    advent: 'assets/advent/advent.png', // the Advent piece (Play.spawnPipePair, only in a December Daily run)
    'fairy-lights': 'assets/advent/fairy-lights.png', // the fairy lights along the ceiling (1c.9)
  },
};

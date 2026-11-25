// Christmas (plan 17): the December art the game swaps in while adventSeason holds. Data only. It lives
// outside config.js so that config.js names no asset file (tests/push.test.js stamps a copy of config.js alone).

// The December twins of the stock textures, loaded in season only (Play.loadLazyAudio's
// one flight), never in Boot. `twins` maps a stock key to the key shown while the season holds (seasonalSkin);
// the stock key stays the game's state (Play.poopStockKey), so the race snapshot and the match slot send it and
// each side maps it through its own skin. The fart alternates `fartFrames` on the stink frames' clock; its
// `twins` entry is the first frame (the ghost has no clock). No poop-dead twin yet: the stock dead frame
// shows (D13). Every file is a full 'assets/advent/….png' literal, so the service worker precaches it.
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
    'poop-speech': 'poop-speech-santa',
    // The world pickups only (D2; 1.11): the HUD, the cards, Over and Stats keep the stock items.
    fiber: 'candy-cane',
    probiotic: 'gingerbread',
    bacteria: 'bacteria-santa',
  },
  fartFrames: ['poop-fart-santa1', 'poop-fart-santa2'],
  snowCap: 'pipe-snow', // on each bottom pipe's cap, at TUNING.advent.snowCap from the cap's top-left (Play.addSnowCap)
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
    'poop-speech-santa': 'assets/advent/poop-speech-santa.png',
    'candy-cane': 'assets/advent/candy-cane.png',
    gingerbread: 'assets/advent/gingerbread.png',
    'bacteria-santa': 'assets/advent/bacteria-santa.png',
    'pipe-snow': 'assets/advent/pipe-snow.png',
    bowelidays: 'assets/advent/bowelidays.png', // all December over the title (countdownLine's image)
  },
};

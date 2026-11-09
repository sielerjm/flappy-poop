// Guest names for a tournament (🏅) slot without a user code: AdjectiveNoun### (001–999),
// e.g. "JollyPlunger042". Session-only: never saved, never posted. Words stay short so every
// name fits the username limit (NAME_MAX, 16 code points: 6 + 7 + 3), and clean: silly gut and
// toilet nouns, nothing rude (tests/tournamentNames.test.js checks both).

export const GUEST_WORDS = {
  adjectives: [
    'Happy', 'Sunny', 'Brave', 'Speedy', 'Lucky', 'Jolly', 'Zippy', 'Bouncy', 'Fluffy', 'Sleepy',
    'Sneaky', 'Wobbly', 'Mighty', 'Plucky', 'Snappy', 'Rapid', 'Turbo', 'Royal', 'Cosmic', 'Dizzy',
    'Fancy', 'Groovy', 'Peppy', 'Swift', 'Tiny', 'Giant', 'Golden', 'Rusty', 'Breezy', 'Cheery',
  ],
  nouns: [
    'Poop', 'Plop', 'Toot', 'Bean', 'Plunger', 'Flush', 'Nugget', 'Sprout', 'Biscuit', 'Pickle',
    'Bubble', 'Noodle', 'Stinker', 'Burrito', 'Prune', 'Kernel', 'Potty', 'Bidet', 'Tummy', 'Belly',
    'Gurgle', 'Rumble', 'Splash', 'Sploosh', 'Corn', 'Loo', 'Plopper', 'Tooter', 'Wiggle', 'Bloop',
  ],
};

const pick = (list, rng) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

/**
 * A guest name not already in `taken` (any case): an adjective, a noun and a three-digit
 * number from `rng` (0–1). Rerolls on a clash; 27 million names make a second try rare.
 */
export function rollGuestName(rng, taken = []) {
  const used = new Set(taken.map((n) => String(n).toLowerCase()));
  for (let tries = 0; tries < 100; tries += 1) {
    const num = String(1 + Math.min(998, Math.floor(rng() * 999))).padStart(3, '0');
    const name = `${pick(GUEST_WORDS.adjectives, rng)}${pick(GUEST_WORDS.nouns, rng)}${num}`;
    if (!used.has(name.toLowerCase())) return name;
  }
  throw new Error('rollGuestName: no free name');
}

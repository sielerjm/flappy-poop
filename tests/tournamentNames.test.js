import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/logic.js';
import { validateName, NAME_MAX } from '../src/save.js';
import { GUEST_WORDS, rollGuestName } from '../src/tournamentNames.js';

const BANNED = ['shit', 'crap', 'fuck', 'piss', 'ass', 'dick', 'cock', 'butt', 'cum', 'sex', 'damn', 'hell', 'turd', 'fart']; // substrings: 'pee' and 'wee' sit inside harmless words (Speedy, Tweet)

test('guest words: capitalised letters only, no repeats, nothing rude', () => {
  for (const [kind, list] of Object.entries(GUEST_WORDS)) {
    assert.ok(list.length >= 20, `${kind}: enough variety`);
    assert.equal(new Set(list).size, list.length, `${kind}: no repeats`);
    for (const w of list) {
      assert.match(w, /^[A-Z][a-z]+$/, `${kind}: ${w}`);
      for (const bad of BANNED) assert.ok(!w.toLowerCase().includes(bad), `${kind}: ${w} contains ${bad}`);
    }
  }
});

test('every possible guest name fits the username limit', () => {
  const longestAdj = Math.max(...GUEST_WORDS.adjectives.map((w) => w.length));
  const longestNoun = Math.max(...GUEST_WORDS.nouns.map((w) => w.length));
  assert.ok(longestAdj + longestNoun + 3 <= NAME_MAX, `${longestAdj} + ${longestNoun} + 3 > ${NAME_MAX}`);
});

test('rollGuestName: AdjectiveNoun###, a valid username, the same for the same seed', () => {
  const rng = createRng(42);
  for (let i = 0; i < 500; i += 1) {
    const name = rollGuestName(rng);
    assert.match(name, /^[A-Z][a-z]+[A-Z][a-z]+\d{3}$/, name);
    assert.ok(!name.endsWith('000'), `${name}: numbers run 001–999`);
    assert.equal(validateName(name).ok, true, name);
    const adj = GUEST_WORDS.adjectives.find((a) => name.startsWith(a));
    assert.ok(adj && GUEST_WORDS.nouns.includes(name.slice(adj.length, -3)), name);
  }
  assert.equal(rollGuestName(createRng(7)), rollGuestName(createRng(7)));
});

test('rollGuestName rerolls a name already in the lobby (any case)', () => {
  const first = rollGuestName(createRng(9));
  const again = rollGuestName(createRng(9), [first.toUpperCase()]);
  assert.notEqual(again, first);
  const stuck = () => 0; // always the same draw
  const only = rollGuestName(stuck);
  assert.throws(() => rollGuestName(stuck, [only]), /no free name/);
});

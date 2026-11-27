// Plan 17, 1b.2e (D17, Michael 26 Nov; sheet 10 calls 27 Nov): choose your 🎅. The changing 🎅 draws from the plain
// 🎅 🤶 🧑‍🎄 only (plainSantas); a saved choice (any supported variant) replaces it; a red dot invites the first tap and
// goes for good once the picker opens. Both keys are this device's and survive Clear user (signOut).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playScene, registry, absorb, fakeStorage } from './support/scenes.js';
import { TUNING as T, LEADERBOARD } from '../src/config.js';
import { plainSantas } from '../src/logic.js';
import { OVERLAY_SCENES } from '../src/ui/overlayStack.js';
import { t } from '../src/i18n.js';

const ALL = T.advent.santas;
const [SANTA, MRS, MX] = [ALL[0], ALL[6], ALL[12]];
const DEC = '2026-12-05';

/** A Play on a December pretend date (test mode), this device drawing `santas`, on a fresh fake localStorage. */
function scene({ santas = ALL, day = DEC, storage = fakeStorage() } = {}) {
  globalThis.localStorage = storage;
  const texts = [];
  const s = playScene({
    registry: registry({ testMode: true, testPretendDay: day, santas }),
    dailySun: { active: true, setText: (v) => texts.push(v) },
    scene: { isActive: () => false, get: () => null },
  });
  s.texts = texts;
  return s;
}

test('plainSantas: the variants with no skin-tone modifier, in order; the plain 🎅 when none is left', () => {
  assert.deepEqual(plainSantas(ALL), [SANTA, MRS, MX]);
  assert.equal(ALL.length, 18, 'the picker still offers all 18');
  assert.deepEqual(plainSantas([SANTA, ALL[1], MRS, ALL[7]]), [SANTA, MRS], 'a device that cannot draw 🧑‍🎄');
  assert.deepEqual(plainSantas([ALL[3], ALL[9]]), [ALL[3]], 'no plain one: the first');
  for (const s of plainSantas(ALL)) assert.ok(!/[\u{1F3FB}-\u{1F3FF}]/u.test(s), s);
});

test('nothing saved: the changing 🎅 is one of the plain three, never the same twice in a row, all three in turn', () => {
  const s = scene();
  const seen = new Set();
  let last = null;
  for (let i = 0; i < 2000; i += 1) {
    s.pickVisitSanta();
    const now = s.registry.get('santa');
    assert.notEqual(now, last, `pick ${i} repeated ${now}`);
    seen.add(now);
    last = now;
  }
  assert.deepEqual([...seen].sort(), [SANTA, MRS, MX].sort());
});

test('a device with two plain ones alternates them strictly', () => {
  const s = scene({ santas: [SANTA, ALL[1], MRS, ALL[7]] });
  const picks = [];
  for (let i = 0; i < 10; i += 1) {
    s.pickVisitSanta();
    picks.push(s.registry.get('santa'));
  }
  assert.deepEqual(new Set(picks), new Set([SANTA, MRS]));
  for (let i = 1; i < picks.length; i += 1) assert.notEqual(picks[i], picks[i - 1]);
});

test('a saved choice shows every visit; one this device cannot draw falls back to the changing 🎅; off season nothing is picked', () => {
  const toned = ALL[10]; // 🤶🏾
  const s = scene();
  s.saveSantaChoice(toned);
  for (let i = 0; i < 5; i += 1) {
    s.pickVisitSanta();
    assert.equal(s.registry.get('santa'), toned);
  }
  const narrow = scene({ santas: [SANTA, MRS], storage: fakeStorage(new Map([[LEADERBOARD.santaChoiceKey, JSON.stringify(toned)]])) });
  narrow.pickVisitSanta();
  assert.ok([SANTA, MRS].includes(narrow.registry.get('santa')), 'an unsupported saved choice is ignored');
  const off = scene({ day: '2026-11-15', storage: fakeStorage(new Map([[LEADERBOARD.santaChoiceKey, JSON.stringify(toned)]])) });
  off.pickVisitSanta();
  assert.equal(off.registry.get('santa'), undefined);
});

test('saveSantaChoice stores the pick, shows it at once on the home button, and refuses a glyph this device does not offer', () => {
  const s = scene({ santas: [SANTA, ALL[2], MRS] });
  assert.equal(s.santaChoice(), null);
  s.saveSantaChoice(ALL[2]);
  assert.equal(s.santaChoice(), ALL[2]);
  assert.equal(s.registry.get('santa'), ALL[2]);
  assert.equal(s.texts.at(-1), ALL[2], 'the home 🎅 redrawn');
  s.saveSantaChoice(ALL[17]);
  assert.equal(s.santaChoice(), ALL[2], 'not offered here: unchanged');
  assert.equal(scene({ storage: globalThis.localStorage }).santaChoice(), ALL[2], 'a reload keeps it');
});

test('the red dot: in season, while the 🎅 is tappable (two or more variants) and the picker has not been opened; gone for good after', () => {
  const storage = fakeStorage();
  const s = scene({ storage });
  assert.equal(s.santaTappable(), true);
  assert.equal(s.santaDotShown(), true);
  s.markSantaSeen();
  assert.equal(s.santaDotShown(), false);
  assert.equal(scene({ storage }).santaDotShown(), false, 'after a reload');
  assert.equal(scene({ day: '2026-11-15' }).santaDotShown(), false, 'off season');
  assert.equal(scene({ day: '2026-11-15' }).santaTappable(), false, 'off season');
  const one = scene({ santas: [SANTA] });
  assert.equal(one.santaTappable(), false, 'one variant: nothing to choose');
  assert.equal(one.santaDotShown(), false);
});

test('Clear user (signOut) keeps the saved 🎅 and the dot\'s flag: they are this device\'s, not the player\'s', () => {
  const storage = fakeStorage();
  const s = scene({ storage });
  s.saveSantaChoice(ALL[4]);
  s.markSantaSeen();
  Object.assign(s, {
    setSaveState() {},
    submitStore: absorb(), mergeStore: absorb(), renameStore: absorb(), careerStore: absorb(), streakStore: absorb(),
    eduStore: absorb(), eduShare: absorb(), consentStore: absorb(), settings: absorb(), researchQueue: absorb(),
    adventStores: new Map(), refreshTestBadge() {}, refreshEduDue() {}, best: absorb(),
  });
  s.signOut();
  assert.equal(storage.getItem(LEADERBOARD.santaChoiceKey), JSON.stringify(ALL[4]));
  assert.ok(storage.getItem(LEADERBOARD.santaDotKey));
  assert.equal(scene({ storage }).santaChoice(), ALL[4]);
  assert.equal(scene({ storage }).santaDotShown(), false);
});

test('the keys sit beside the last 🎅\'s; the picker is an overlay; its words are in every locale; dailyTitle starts with {daily} (the title\'s tappable glyph)', () => {
  assert.equal(LEADERBOARD.santaChoiceKey, 'flappyPoop.santaChoice');
  assert.equal(LEADERBOARD.santaDotKey, 'flappyPoop.santaDot');
  assert.equal(OVERLAY_SCENES.santapick, 'SantaPicker');
  for (const locale of ['en', 'zh-Hans']) {
    for (const k of ['santaPickTitle', 'santaPickSave', 'dailyHelp']) assert.ok(t(locale, k) && t(locale, k) !== k, `${locale} ${k}`);
    assert.ok(t(locale, 'dailyTitle').startsWith('{daily} '), `${locale} dailyTitle`);
  }
});

test('the (?) card on the 🌞 popup: while it is up, Play, the 🧩 line and the title 🎅 do nothing; Esc / ✕ / B take the card down first', async () => {
  const { Daily } = await import('../src/scenes/Daily.js');
  const calls = [];
  const play = { handleChrome: (i) => calls.push(i), startDaily: () => calls.push('start'), openSavePanel: () => calls.push('save') };
  const d = Object.assign(Object.create(Daily.prototype), {
    helpOpen: true,
    help: { destroy: () => calls.push('cardGone') },
    mode: () => 'play',
    scene: { key: 'Daily', get: () => play, isActive: (k) => k === 'Daily', getIndex: () => 1, stop: () => calls.push('stop') },
  });
  d.press();
  d.openBook();
  d.tapSanta();
  d.openHelp();
  assert.deepEqual(calls, [], 'nothing under the card acts');
  d.close();
  assert.deepEqual(calls, ['cardGone'], 'the card goes, the popup stays');
  assert.equal(d.helpOpen, false);
  d.tapSanta();
  assert.deepEqual(calls.at(-1), 'santapick', 'with the card down the 🎅 opens the picker');
});

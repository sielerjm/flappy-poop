// Blocked storage (plan 28, 1.3; AGENTS.md rule 7): with site data blocked, a browser throws as soon as
// `localStorage` is read, before any store's own guard runs. This file makes the global's getter throw
// the way Safari and Chrome do, before anything is imported; node --test runs each test file in its own
// process, so no other file sees it.
const blocked = () => {
  throw new DOMException('The operation is insecure.', 'SecurityError');
};
Object.defineProperty(globalThis, 'localStorage', { get: blocked, configurable: true });

const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { readdirSync, readFileSync, statSync } = await import('node:fs');
const { join, relative } = await import('node:path');
const { browserStorage, pageStorage } = await import('../src/store.js');
const { createSettingsStore, storedLocale } = await import('../src/logic.js');
const { TUNING } = await import('../src/config.js');
const save = await import('../src/save.js');
const lb = await import('../src/leaderboard.js');
const research = await import('../src/research.js');

test('the getter is blocked (else this file tests nothing)', () => {
  assert.throws(() => globalThis.localStorage, /insecure/);
});

test("browserStorage: the page load's memory when reading localStorage throws (always the same one), the storage when it can be read, null when there is none", () => {
  const mem = browserStorage();
  assert.equal(mem, pageStorage(), 'this process: blocked, so the page memory');
  assert.equal(browserStorage(), mem, 'one per page load');
  assert.equal(browserStorage({ get localStorage() { throw new Error('denied'); } }), mem);
  const fake = { getItem() {}, setItem() {}, removeItem() {} };
  assert.equal(browserStorage({ localStorage: fake }), fake);
  assert.equal(browserStorage({}), null, 'no localStorage at all (Node): null, as before');
});

test('pageStorage behaves as a Storage: strings in and out, null for a missing key, remove, clear, key, length', () => {
  const m = pageStorage();
  m.clear();
  assert.equal(m.getItem('a'), null);
  m.setItem('a', 1);
  m.setItem('b', { x: 1 });
  assert.deepEqual([m.getItem('a'), m.getItem('b'), m.length, m.key(0), m.key(5)], ['1', '[object Object]', 2, 'a', null]);
  m.removeItem('a');
  assert.deepEqual([m.getItem('a'), m.length], [null, 1]);
  m.clear();
  assert.equal(m.length, 0);
});

test('with storage blocked, every store the game builds on its default storage works, and keeps what it was told for the page load: a second store (a Play restart) reads it back', () => {
  pageStorage().clear();
  // The save, its name and its id survive a "restart" (a new loadLocal).
  assert.deepEqual(save.loadLocal().top, [], 'loadLocal: an empty save at first');
  const withId = save.ensureId(save.saveLocal({ name: 'abc' }));
  assert.match(withId.id, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual([save.loadLocal().name, save.loadLocal().id], ['abc', withId.id], 'the name and the id read back');
  // Each store's first read: empty, never a throw.
  const make = {
    createSubmitStore: () => lb.createSubmitStore(),
    createMergeStore: () => lb.createMergeStore(),
    createRenameStore: () => lb.createRenameStore(),
    createTournamentQueue: () => lb.createTournamentQueue(),
    createDailyStore: () => lb.createDailyStore(),
    createDailyQueue: () => lb.createDailyQueue(),
    createCareerStore: () => lb.createCareerStore(),
    createEduShareStore: () => lb.createEduShareStore(),
    createConsentStore: () => research.createConsentStore(),
    createResearchQueue: () => research.createResearchQueue(),
  };
  for (const [name, f] of Object.entries(make)) {
    const store = f();
    const read = store.load ?? store.read;
    assert.equal(typeof read, 'function', `${name} has load()`);
    assert.doesNotThrow(() => read.call(store), name);
  }
  // The settings (the language a player picked) and the Daily claim read back from a new store.
  const settings = createSettingsStore(browserStorage(), TUNING.settingsKey);
  settings.set({ locale: 'zh-Hans' });
  assert.equal(storedLocale(browserStorage(), TUNING.settingsKey), 'zh-Hans', "Play's restart finds the language picked (resolveLocale)");
  assert.equal(createSettingsStore(browserStorage(), TUNING.settingsKey).load().locale, 'zh-Hans');
  // The 📚 switch (plan 35, 1.5; the 2026-11-13 audit's "forgotten on every restart"): Play.toggleEducation
  // sets it on the store its create() built, and the next create() builds a new one that reads it back,
  // with later sets of other keys (Settings, Language) keeping it.
  const before = createSettingsStore(browserStorage(), TUNING.settingsKey).load().education;
  createSettingsStore(browserStorage(), TUNING.settingsKey).set({ education: !before });
  createSettingsStore(browserStorage(), TUNING.settingsKey).set({ haptics: false });
  assert.equal(createSettingsStore(browserStorage(), TUNING.settingsKey).load().education, !before, "the 📚 switch holds across Play's restarts");
  createSettingsStore(browserStorage(), TUNING.settingsKey).set({ education: before });
  assert.equal(createSettingsStore(browserStorage(), TUNING.settingsKey).load().education, before, 'and back');
  const day = '2026-11-15';
  lb.createDailyStore().save({ day, playerId: withId.id, level: 1, score: 0, pipes: 0 });
  assert.equal(lb.createDailyStore().load(day, withId.id)?.day, day, "the Daily attempt claimed at a run's start reads back (one attempt a day holds for the visit)");
});

test('no file under src/ reads localStorage itself: every read goes through browserStorage() (src/store.js)', () => {
  const root = new URL('../src/', import.meta.url).pathname;
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.js')) files.push(path);
    }
  };
  walk(root);
  // Any mention of localStorage in code (a member read, a bare global, a destructure, a string key): comment
  // lines (JSDoc) and trailing // comments (after whitespace, so a URL's // is kept) are left out.
  const code = (line) => (/^\s*(\*|\/\*|\/\/)/.test(line) ? '' : line.replace(/(^|\s)\/\/.*$/, ''));
  const readers = files
    .filter((f) => relative(root, f) !== 'store.js')
    .flatMap((f) => readFileSync(f, 'utf8').split('\n').map((line, i) => ({ f: relative(root, f), i: i + 1, line })))
    .filter(({ line }) => /localStorage/.test(code(line)));
  assert.deepEqual(readers.map(({ f, i }) => `${f}:${i}`), []);
});

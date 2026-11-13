// Shared by the tests that run real scene code in Node (plan 24, foundation F1). A scene module reads
// only Phaser.Scene when it is imported, so that is all of Phaser there is here; a scene under test is
// Object.create(Scene.prototype) with just the fields its methods read, and anything heavier (texts,
// sprites, the level bar) is a sink that takes every call. Not a test file itself (the npm test glob
// is tests/**/*.test.js).
globalThis.Phaser ??= {
  Scene: class {
    constructor(key) {
      this.sysKey = key;
    }
  },
};

export const { Play } = await import('../../src/scenes/Play.js');
export const { Quiz } = await import('../../src/scenes/Quiz.js');

/** A sink: any property is itself, any call returns itself, and it never looks like a promise. */
export function absorb() {
  const f = function () {};
  const p = new Proxy(f, { get: (_t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => 0 : p), apply: () => p });
  return p;
}

/**
 * localStorage as a Map. `shared` lets two stores (two tabs) see one storage. `setThrows` /
 * `getThrows` make writes or reads throw, as a full or blocked storage does.
 */
export function fakeStorage(shared = new Map(), { setThrows = false, getThrows = false } = {}) {
  const s = {
    setThrows,
    getThrows,
    getItem: (k) => {
      if (s.getThrows) throw new Error('storage blocked');
      return shared.has(k) ? shared.get(k) : null;
    },
    setItem: (k, v) => {
      if (s.setThrows) throw new Error('QuotaExceededError');
      shared.set(k, String(v));
    },
    removeItem: (k) => {
      if (s.getThrows) throw new Error('storage blocked');
      shared.delete(k);
    },
    map: shared,
  };
  return s;
}

/** Phaser's data registry, as a Map. */
export function registry(init = {}) {
  const m = new Map(Object.entries(init));
  return { get: (k) => m.get(k), set: (k, v) => m.set(k, v), remove: (k) => m.delete(k), has: (k) => m.has(k) };
}

/** A ready-screen switch (createToggle): remembers what it was set to. */
export function toggleStub() {
  return { on: null, setOn(v) { this.on = v; }, setVisible() {}, destroy() {} };
}

/** A Play scene with `fields` on top of nothing: the test sets what the methods it calls read. */
export function playScene(fields = {}) {
  return Object.assign(Object.create(Play.prototype), fields);
}

/** A Quiz scene with `fields` on top of nothing. */
export function quizScene(fields = {}) {
  return Object.assign(Object.create(Quiz.prototype), fields);
}

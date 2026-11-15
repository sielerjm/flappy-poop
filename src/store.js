/**
 * One JSON value kept in browser storage, the way every education store keeps its own (plan 24, F3).
 * NO Phaser, no imports.
 *
 * Storage can throw or be full (AGENTS.md rule 7), and every tab of the game shares it:
 *  - storage that can be read is the truth, so another tab's write, or its Clear, shows at once;
 *  - a missing key, or an entry that cannot be parsed, reads as empty (`clean(null)`);
 *  - memory serves when there is no storage, when reading it throws, or when this page load's
 *    last write failed (a full storage): then the value lives for this page load only;
 *  - clear() removes the key and empties memory.
 * `clean(raw)` turns whatever is stored (or null) into the store's value; it must accept its own
 * output. saved() says whether the value outlives this page load: false with no storage, after a
 * write that failed (a full storage), while reads throw, or on the page's stand-in for blocked storage (pageStorage)
 * (plan 28, 3.1a: a restore says when it lasts for this visit only). Nothing here throws.
 */
export function createJsonStore(storage, key, clean) {
  let memory = clean(null);
  let unsaved = false; // this load's last write did not reach storage: storage is behind memory
  let unreadable = false; // the last read of storage threw: memory served it
  const read = () => {
    if (!storage || unsaved) return clean(memory);
    let raw;
    try {
      raw = storage.getItem(key);
      unreadable = false;
    } catch {
      unreadable = true;
      return clean(memory);
    }
    if (raw == null) {
      memory = clean(null);
      return clean(memory);
    }
    try {
      memory = clean(JSON.parse(raw));
    } catch {
      memory = clean(null);
    }
    return clean(memory);
  };
  const write = (value) => {
    memory = clean(value);
    try {
      storage?.setItem(key, JSON.stringify(memory));
      unsaved = false;
    } catch {
      unsaved = true;
    }
    return clean(memory);
  };
  const clear = () => {
    memory = clean(null);
    unsaved = false;
    try {
      storage?.removeItem(key);
    } catch {
      unsaved = true; // the key is still there: this load reads the empty memory instead
    }
  };
  const saved = () => Boolean(storage) && !unsaved && !unreadable && storage !== pageMemory;
  return { read, write, clear, saved };
}

/** This page load's stand-in for a blocked localStorage (pageStorage), made on first use. */
let pageMemory = null;

/**
 * A Storage-like object in memory (getItem, setItem, removeItem, clear, key, length), one per page load:
 * what browserStorage() hands out when the browser blocks storage, so every store keeps what it was told
 * until the page reloads (the save and its id, the settings, the Daily claim, the queues), across Play's
 * restarts too.
 */
export function pageStorage() {
  if (!pageMemory) {
    const map = new Map();
    pageMemory = {
      getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
      setItem: (k, v) => void map.set(String(k), String(v)),
      removeItem: (k) => void map.delete(String(k)),
      clear: () => map.clear(),
      key: (i) => [...map.keys()][i] ?? null,
      get length() {
        return map.size;
      },
    };
  }
  return pageMemory;
}

/**
 * The browser's localStorage (plan 28, 1.3; AGENTS.md rule 7). With site data blocked (Safari's "Block
 * All Cookies", Chrome's "don't let sites save data") reading the property itself throws, before any
 * store's own guard runs: then this page load's pageStorage(), so nothing is kept past a reload but
 * everything is kept until one. Null where there is no localStorage at all (Node). Every read of
 * localStorage in src/ goes through here (tests/blockedStorage.test.js). Never throws.
 */
export function browserStorage(scope = globalThis) {
  try {
    return scope?.localStorage ?? null;
  } catch {
    return pageStorage();
  }
}

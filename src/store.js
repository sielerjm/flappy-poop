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
 * output. Nothing here throws.
 */
export function createJsonStore(storage, key, clean) {
  let memory = clean(null);
  let unsaved = false; // this load's last write did not reach storage: storage is behind memory
  const read = () => {
    if (!storage || unsaved) return clean(memory);
    let raw;
    try {
      raw = storage.getItem(key);
    } catch {
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
  return { read, write, clear };
}

// A fake DOM just big enough for the game's DOM panels (src/ui/savePanel.js, eduDataPanel.js) to be
// built, opened and clicked in Node (plan 24). install() puts `document` on globalThis; elements are
// found by id with body.find(id). Not a test file itself.
export class El {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.className = '';
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.placeholder = '';
    this.parent = null;
    this.style = {};
    this.files = null; // a file input's picked files (plan 28, 3.1b)
    this.href = '';
    this.download = '';
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
    if (k === 'hidden') this.hidden = true;
    if (k === 'id') this.id = v;
  }
  getAttribute(k) {
    return this.attrs[k] ?? null;
  }
  append(...cs) {
    for (const c of cs) {
      if (c instanceof El) c.parent = this;
      this.children.push(c);
    }
  }
  /** As append, returning the child (src/share.js's download link). */
  appendChild(c) {
    this.append(c);
    return c;
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  /** Fire `type` at this element's listeners, awaited in order. */
  async fire(type, event = {}) {
    for (const fn of this.listeners[type] ?? []) await fn({ target: this, key: undefined, preventDefault() {}, stopPropagation() {}, ...event });
  }
  async click() {
    await this.fire('click');
  }
  contains(x) {
    return x === this || this.children.some((c) => c instanceof El && c.contains(x));
  }
  focus() {
    globalThis.document.activeElement = this;
  }
  blur() {}
  select() {}
  setSelectionRange() {}
  find(id) {
    if (this.id === id) return this;
    for (const c of this.children) {
      const f = c instanceof El && c.find(id);
      if (f) return f;
    }
    return null;
  }
}

/** Put a fresh fake `document` on globalThis; returns its body. */
export function installDom() {
  const body = new El('body');
  globalThis.document = { createElement: (t) => new El(t), head: new El('head'), body, activeElement: null };
  return body;
}

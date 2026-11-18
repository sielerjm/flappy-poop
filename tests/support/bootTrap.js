// Runs index.html's inline boot trap (window.__flappyBoot: plan 35, 1.1 and 1.2) in Node, on a fake
// window and document just big enough for it: the listeners it registers, the timers it sets, the
// scripts it appends and the splash it marks. The trap's one dynamic import (src/splash.js) becomes a
// call to `importSplash`, so a test decides whether that module loads. Not a test file itself.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

/** The inline <script> that sets window.__flappyBoot, as text. */
export function trapSource(page = html) {
  for (const m of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) if (m[1].includes('__flappyBoot =')) return m[1];
  throw new Error('index.html: no inline script sets window.__flappyBoot');
}

class ClassList {
  constructor() {
    this.set = new Set();
  }
  add(c) {
    this.set.add(c);
  }
  remove(c) {
    this.set.delete(c);
  }
  contains(c) {
    return this.set.has(c);
  }
}

/**
 * @param {{ origin?: string, importSplash?: (path: string) => Promise<object> }} [options]
 *   importSplash: what `import('./src/splash.js')` gives (default: the module cannot load).
 */
export function bootTrap({ origin = 'https://game.example', importSplash = () => Promise.reject(new Error('no module')) } = {}) {
  const listeners = {};
  const timers = [];
  const appended = [];
  const imports = [];
  const splash = {
    id: 'splash',
    classList: new ClassList(),
    attrs: { 'aria-busy': 'true' },
    clicks: [],
    removeAttribute(k) {
      delete this.attrs[k];
    },
    addEventListener(type, fn) {
      if (type === 'click') this.clicks.push(fn);
    },
  };
  const w = {
    reloads: 0,
    location: {
      origin,
      reload() {
        w.reloads += 1;
      },
    },
    addEventListener(type, fn, capture) {
      (listeners[type] ??= []).push({ fn, capture: capture === true });
    },
    setTimeout(fn, ms) {
      timers.push({ fn, ms });
      return timers.length;
    },
  };
  const d = {
    getElementById: (id) => (id === 'splash' ? splash : null),
    // A script's src reads back absolute, as in a browser (the trap tells its own scripts by origin).
    createElement: (tag) => {
      let src = '';
      return {
        tagName: tag.toUpperCase(),
        onload: null,
        onerror: null,
        get src() {
          return src;
        },
        set src(v) {
          src = new URL(v, `${origin}/`).href;
        },
      };
    },
    head: {
      appendChild(el) {
        appended.push(el);
        return el;
      },
    },
  };
  const source = trapSource().replace(/\bimport\(/g, '__import(');
  const context = vm.createContext({
    window: w,
    document: d,
    __import: (path) => {
      imports.push(path);
      return importSplash(path);
    },
  });
  vm.runInContext(source, context, { filename: 'index.html (boot trap)' });
  /** Fire a window event at the trap's listeners of that type. */
  const fire = (type, event) => {
    for (const { fn } of listeners[type] ?? []) fn(event);
  };
  /** Let the trap's promise callbacks (the splash import) run. */
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return { w, d, B: w.__flappyBoot, listeners, timers, appended, imports, splash, fire, settle };
}

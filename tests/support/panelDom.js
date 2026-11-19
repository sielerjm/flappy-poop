// The fake DOM extended for the tournament panel (src/ui/tournamentPanel.js), as tests/matchHost.test.js
// extends tests/support/dom.js inline: replaceChildren, offsetParent, classList, hasAttribute,
// querySelectorAll('button' | 'button.pad') and document.getElementById. Plus a fake game for the
// panel's registry, keyboard, events and scenes. Not a test file itself.
import { El, installDom } from './dom.js';
import { registry } from './scenes.js';

export function installPanelDom() {
  const body = installDom();
  const proto = El.prototype;
  proto.replaceChildren = function (...cs) {
    this.children = [];
    this.append(...cs);
  };
  Object.defineProperty(proto, 'offsetParent', { get() { for (let e = this; e; e = e.parent) if (e.hidden) return null; return {}; }, configurable: true });
  Object.defineProperty(proto, 'classList', {
    configurable: true,
    get() {
      const el = this;
      const set = () => new Set(el.className.split(' ').filter(Boolean));
      return {
        add: (c) => (el.className = [...set().add(c)].join(' ')),
        remove: (c) => {
          const s = set();
          s.delete(c);
          el.className = [...s].join(' ');
        },
        contains: (c) => set().has(c),
      };
    },
  });
  proto.hasAttribute = function (k) {
    return k in this.attrs;
  };
  const all = (el, out = []) => {
    out.push(el);
    for (const c of el.children) if (c instanceof El) all(c, out);
    return out;
  };
  proto.querySelectorAll = function (sel) {
    const els = all(this).slice(1);
    if (sel === 'button') return els.filter((e) => e.tag === 'button');
    if (sel === 'button.pad') return els.filter((e) => e.tag === 'button' && e.className.split(' ').includes('pad'));
    return [];
  };
  globalThis.document.getElementById = (id) => body.find(id);
  return body;
}

export function fakeGame({ versus = null, active = false, play = null, state = undefined } = {}) {
  const listeners = {};
  const reg = registry();
  if (state !== undefined) reg.set('tournament', state);
  return {
    registry: reg,
    input: { keyboard: { enabled: true } },
    events: {
      on: (k, fn) => (listeners[k] ??= []).push(fn),
      emit: (k, d) => (listeners[k] ?? []).forEach((fn) => fn(d)),
      listenerCount: (k) => (listeners[k] ?? []).length,
    },
    scene: {
      getScene: (k) => (k === 'Versus' ? versus : k === 'Play' ? play : null),
      isActive: (k) => k === 'Versus' && active,
    },
  };
}

/** Text of an element and everything under it. */
export const textOf = (el) => (el ? [el.textContent, ...el.children.map((c) => (c instanceof El ? textOf(c) : String(c)))].join('') : '');

// The 📚 popup (src/ui/eduIntroPanel.js) built and clicked in a fake DOM (audit 2026-11-16, AUD-061): its
// New cards per level row (plan 28, Stage 3b) and the lines that follow the config. The browser smoke
// (education-unlock) clicks the row too; this covers what it does not read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { El, installDom } from './support/dom.js';
import { TUNING as T } from '../src/config.js';
import { t } from '../src/i18n.js';

const body = installDom();
// What this panel uses beyond tests/support/dom.js (zone D's extension in the audit).
const proto = El.prototype;
proto.replaceChildren = function (...cs) {
  this.children = [];
  this.append(...cs);
};
Object.defineProperty(proto, 'tagName', { get() { return this.tag.toUpperCase(); }, configurable: true });
Object.defineProperty(proto, 'offsetParent', { get() { return {}; }, configurable: true });
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
proto.scrollIntoView = function () {};
proto.getBoundingClientRect = function () {
  return { left: 0, top: 0, width: 0, height: 0 };
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
proto.querySelector = function (sel) {
  return this.querySelectorAll(sel)[0] ?? null;
};
document.getElementById = (id) => body.find(id);
let now = 1000;
Object.defineProperty(globalThis.performance, 'now', { value: () => now, configurable: true });

const { openEduIntroPanel, closeEduIntroPanel } = await import('../src/ui/eduIntroPanel.js');

/** An element's text: its string children, and its elements' text, in order. */
const text = (el) => el.children.map((c) => (typeof c === 'string' ? c : text(c))).join('');
const el = (id) => body.find(id);

function open({ locale = 'en', perLevel = T.education.newPerLevelDefault, newPerDay = null } = {}) {
  const play = {
    perLevel,
    calls: 0,
    eduIntroInfo() {
      return { counts: { new: 1, missed: 0, review: 0 }, seen: 0, total: 10, startOffered: true, startLevel: 1, order: 'after', perLevel: this.perLevel, newPerDay, testMode: false };
    },
    stepEduStart() {},
    setEduNewOrder() {},
    setEduNewPerLevel(n) {
      this.perLevel = n;
      this.calls += 1;
    },
    startFromEduIntro() {},
    openEduData() {},
  };
  openEduIntroPanel({ game: { registry: { get: () => false }, input: { keyboard: { enabled: true } } }, play, locale });
  now += 1000; // past the click lockout
  return play;
}
const pressed = () => T.education.newPerLevelChoices.map((n) => el(`edu-intro-per-${n}`).getAttribute('aria-pressed'));

test('New cards per level (plan 28, Stage 3b): 3 / 5 / All, the default pressed, with its line; a click presses and stores another and the line follows; the chosen button keeps the focus (AUD-026); both languages', async () => {
  assert.deepEqual(T.education.newPerLevelChoices, [3, 5, 'all']);
  for (const locale of ['en', 'zh-Hans']) {
    const play = open({ locale });
    assert.equal(el('edu-intro-per').getAttribute('aria-label'), t(locale, 'eduIntroPerLevel'), `${locale}: the group's name`);
    assert.deepEqual(['3', '5', 'all'].map((n) => text(el(`edu-intro-per-${n}`))), ['3', '5', t(locale, 'eduPerLevelAll')], `${locale}: the labels`);
    assert.deepEqual(pressed(), ['false', 'true', 'false'], `${locale}: 5 pressed by default`);
    assert.equal(text(el('edu-intro-per-hint')), t(locale, 'eduPerLevelHint').replace('{n}', '5'));
    el('edu-intro-per-3').focus();
    await el('edu-intro-per-3').click();
    assert.deepEqual([pressed(), play.perLevel, text(el('edu-intro-per-hint'))], [['true', 'false', 'false'], 3, t(locale, 'eduPerLevelHint').replace('{n}', '3')], `${locale}: 3 chosen`);
    assert.equal(document.activeElement?.id, 'edu-intro-per-3', `${locale}: the focus stays on the chosen button, so a second Enter repeats the choice`);
    await el('edu-intro-per-all').click();
    assert.deepEqual([pressed(), play.perLevel, text(el('edu-intro-per-hint'))], [['false', 'false', 'true'], 'all', t(locale, 'eduPerLevelAllHint')], `${locale}: All chosen`);
    assert.equal(play.calls, 2, 'one call per click');
    closeEduIntroPanel();
  }
});

test("a click in the popup's first moments is dropped, the new row's too (plan 26, A2's lockout)", async () => {
  open();
  closeEduIntroPanel();
  // Open again without moving the clock: inside the lockout, the root's capturing listener stops the click.
  const play = { ...open(), calls: 0 };
  closeEduIntroPanel();
  openEduIntroPanel({ game: { registry: { get: () => false }, input: { keyboard: { enabled: true } } }, play, locale: 'en' });
  let stopped = false;
  await body.find('edu-intro-panel').fire('click', { target: el('edu-intro-per-3'), stopImmediatePropagation() { stopped = true; } });
  assert.equal(stopped, true, 'inside the lockout');
  now += 1000;
  stopped = false;
  await body.find('edu-intro-panel').fire('click', { target: el('edu-intro-per-3'), stopImmediatePropagation() { stopped = true; } });
  assert.equal(stopped, false, 'after it');
  closeEduIntroPanel();
});

test('the help line names education.duePerBreak, or every due card while it is null; the daily cap\'s line shows only while newPerDay is a number (audit 2026-11-16, AUD-061)', () => {
  const words = () => text(body.find('edu-intro-panel'));
  open();
  assert.ok(words().includes(t('en', 'eduIntroHowLevels').replace('{n}', String(T.education.duePerBreak))), 'the number of due cards a break asks');
  assert.equal(el('edu-intro-per-day'), null, 'no daily cap: no per-day line');
  closeEduIntroPanel();
  const due = T.education.duePerBreak;
  try {
    T.education.duePerBreak = null;
    open({ newPerDay: 20 });
    assert.ok(words().includes(t('en', 'eduIntroHowLevelsAll')), 'no limit: every due card');
    assert.equal(text(el('edu-intro-per-day')), t('en', 'eduIntroPerDay').replace('{n}', '20'), 'a cap turned back on shows its line');
    closeEduIntroPanel();
  } finally {
    T.education.duePerBreak = due;
  }
});

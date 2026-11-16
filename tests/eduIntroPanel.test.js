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
// As a browser: an element inside a hidden one has no offsetParent (the controller's ring skips it: padButtons).
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

const { openEduIntroPanel, closeEduIntroPanel, eduIntroPadAction } = await import('../src/ui/eduIntroPanel.js');

/** An element's text: its string children, and its elements' text, in order. */
const text = (el) => el.children.map((c) => (typeof c === 'string' ? c : text(c))).join('');
const el = (id) => body.find(id);

function open({ locale = 'en', perLevel = T.education.newPerLevelDefault, newPerDay = null, hideHow = false, hideChoices = false } = {}) {
  const play = {
    perLevel,
    hideHow,
    hideChoices,
    hidden: [],
    calls: 0,
    eduIntroInfo() {
      return { counts: { new: 1, missed: 0, review: 0 }, seen: 0, total: 10, startOffered: true, startLevel: 1, order: 'after', perLevel: this.perLevel, newPerDay, testMode: false, hideHow: this.hideHow, hideChoices: this.hideChoices };
    },
    setEduIntroHidden(section, hidden) {
      this.hidden.push([section, hidden]);
      if (section === 'how') this.hideHow = hidden;
      else this.hideChoices = hidden;
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

test('AUD-063: a restart closes the popup without calling back into the scene it belongs to (closeEduIntroPanel({ notify: false })); a close by the player still tells Play', () => {
  const play = open();
  let told = 0;
  play.onEduIntroClosed = () => (told += 1);
  closeEduIntroPanel({ notify: false });
  assert.equal(told, 0, 'the shutting-down scene is not called: its texts are already destroyed');
  assert.equal(el('edu-intro-panel').hidden, true, 'the popup is closed all the same');
  const again = open();
  again.onEduIntroClosed = () => (told += 1);
  closeEduIntroPanel();
  assert.equal(told, 1, 'a close by the player redraws the ready screen\'s 📚 count');
});

test('plan 28, 4.1: the popup\'s style takes the shared frame (padded by the safe area, the card sized against it, never in vh), so its ✕ stays below an iPhone\'s status bar', () => {
  open();
  const style = document.head.children.find((c) => c.tag === 'style' && c.textContent.includes('#edu-intro-panel'));
  assert.ok(style, 'the popup injects its style');
  assert.ok(style.textContent.includes('max(16px, env(safe-area-inset-top))'), 'the backdrop is padded by the safe area');
  assert.ok(style.textContent.includes('max-height: 100%;'), 'the card never grows past the padded backdrop');
  assert.doesNotMatch(style.textContent, /max-height:\s*\d+vh/, 'no card sized in vh');
  closeEduIntroPanel();
});

const inside = (outer, inner) => all(outer).includes(inner);
const toggleText = (locale, hidden) => `${t(locale, hidden ? 'eduIntroShow' : 'eduIntroHide')} ${hidden ? '▾' : '▴'} ${t(locale, hidden ? 'eduIntroShowHint' : 'eduIntroHideHint')}`;

test('Show / Hide (plan 28, 4.2): under each heading one button, its word and the line beside it saying what a press does; a press hides or shows the section, is stored once and keeps the focus; both languages', async () => {
  for (const locale of ['en', 'zh-Hans']) {
    const play = open({ locale });
    const how = el('edu-intro-how-toggle');
    const choices = el('edu-intro-choices-toggle');
    assert.ok(how && choices, `${locale}: both toggles`);
    assert.deepEqual([text(how), text(choices)], [toggleText(locale, false), toggleText(locale, false)], `${locale}: "Hide" and its line while shown`);
    assert.ok(how.children.some((c) => c instanceof El && c.className.includes('hint')), `${locale}: the line is inside the button, so a press on it works`);
    assert.deepEqual([how.getAttribute('aria-expanded'), how.getAttribute('aria-controls'), choices.getAttribute('aria-controls')], ['true', 'edu-intro-how', 'edu-intro-choices']);
    assert.deepEqual([el('edu-intro-how').hidden, el('edu-intro-choices').hidden], [false, false], `${locale}: both sections shown by default`);
    how.focus();
    await how.click();
    assert.deepEqual(play.hidden, [['how', true]], `${locale}: one call, How it works hidden`);
    assert.equal(el('edu-intro-how').hidden, true, `${locale}: its list hidden`);
    assert.equal(text(el('edu-intro-how-toggle')), toggleText(locale, true), `${locale}: "Show" and its line while hidden`);
    assert.equal(el('edu-intro-how-toggle').getAttribute('aria-expanded'), 'false');
    assert.equal(document.activeElement?.id, 'edu-intro-how-toggle', `${locale}: the focus stays on the toggle (AUD-026)`);
    await el('edu-intro-choices-toggle').click();
    assert.equal(el('edu-intro-choices').hidden, true, `${locale}: Your choices hidden`);
    assert.ok(inside(el('edu-intro-choices'), el('edu-intro-start')) && inside(el('edu-intro-choices'), el('edu-intro-per')), `${locale}: the start level and both button rows are in the hidden section`);
    assert.ok(!inside(el('edu-intro-choices'), el('edu-intro-device')) && !el('edu-intro-device').hidden && el('edu-intro-data'), `${locale}: the line about where the cards live, with its 📚 Education data link, still shows`);
    closeEduIntroPanel();
  }
});

test('Show / Hide (plan 28, 4.2): a reopen keeps each section as it was left; the controller\'s ring skips a hidden section\'s buttons', async () => {
  const ringPath = () => {
    const seen = [];
    eduIntroPadAction('nav:down'); // the first press shows the ring (on Play)
    for (let i = 0; i < 16; i += 1) {
      eduIntroPadAction('nav:up');
      seen.push(el('edu-intro-panel').querySelectorAll('button.pad')[0]?.id ?? null);
    }
    return seen;
  };
  open({ hideChoices: true });
  assert.equal(el('edu-intro-choices').hidden, true, 'Your choices opens hidden, as left');
  assert.equal(el('edu-intro-how').hidden, false, 'How it works opens shown, as left');
  const hiddenPath = ringPath();
  assert.ok(hiddenPath.includes('edu-intro-choices-toggle') && hiddenPath.includes('edu-intro-how-toggle'), 'the toggles are on the ring');
  assert.ok(!hiddenPath.some((id) => /^edu-intro-(order|per|up|down)/.test(id ?? '')), `no button of the hidden section: ${hiddenPath.join(' ')}`);
  closeEduIntroPanel();
  open();
  assert.ok(ringPath().some((id) => /^edu-intro-(order|per)-/.test(id ?? '')), 'shown, its buttons are on the ring again');
  closeEduIntroPanel();
});

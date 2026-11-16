// The frame every DOM window shares (plan 28, Stage 4, 4.1): src/ui/panelFrame.js. In an iPhone Home Screen
// app (viewport-fit=cover, a black-translucent status bar) a card sized 90vh and centred on the page ran its
// top and ✕ under the clock (Michael's image 3, 16 Nov). The backdrop is padded by the screen's safe area and
// the card is sized against the padded box, never in vh. The browser check is the smoke's education-unlock
// passage at an iPhone's size with its insets faked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { panelFrameCss } from '../src/ui/panelFrame.js';

const rule = (css, selector) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `a rule for ${selector}`);
  return css.slice(at + selector.length + 2, css.indexOf('}', at));
};

test('panelFrameCss: the backdrop covers the page and is padded by the safe area on every side, at least 16 px (the splash\'s padding)', () => {
  const css = panelFrameCss('x-panel');
  const root = rule(css, '#x-panel');
  for (const part of ['position: fixed;', 'inset: 0;', 'display: flex;', 'align-items: center;', 'justify-content: center;', 'box-sizing: border-box;']) assert.ok(root.includes(part), part);
  assert.ok(
    root.includes('padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));'),
    'top, right, bottom and left, in that order',
  );
  assert.ok(css.includes('#x-panel[hidden] { display: none; }'), 'a hidden panel takes no room');
});

test('panelFrameCss: the card never grows past the padded backdrop (it scrolls inside) and is never sized in vh; its width cap follows the option', () => {
  const card = (opts) => rule(panelFrameCss('x-panel', opts), '#x-panel .card');
  for (const part of ['max-height: 100%;', 'max-width: 100%;', 'overflow: auto;', 'box-sizing: border-box;']) assert.ok(card().includes(part), part);
  assert.ok(card().includes('width: min(92vw, 420px);'), 'the default cap');
  assert.ok(card({ width: 560 }).includes('width: min(92vw, 560px);'), 'a wider card (the tournament panel)');
  assert.doesNotMatch(panelFrameCss('x-panel'), /\d\s*vh/, 'no height in vh: in a Home Screen app vh counts the whole screen, not the page');
});

test('every DOM window takes its frame from panelFrameCss; no src/ui file keeps a vh-sized card or its own full-page backdrop (source check)', () => {
  const dir = new URL('../src/ui/', import.meta.url);
  for (const name of ['eduIntroPanel', 'eduDataPanel', 'savePanel', 'tournamentPanel']) {
    const src = readFileSync(new URL(`${name}.js`, dir), 'utf8');
    assert.match(src, /^import \{ panelFrameCss \} from '\.\/panelFrame\.js';$/m, `${name} imports the frame`);
    assert.match(src, /\$\{panelFrameCss\(PANEL_ID(, \{ width: \d+ \})?\)\}/, `${name} puts the frame in its CSS`);
  }
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'panelFrame.js')) {
    const src = readFileSync(new URL(file, dir), 'utf8');
    assert.doesNotMatch(src, /max-height:\s*\d+vh/, `${file}: a card sized in vh`);
    // A full-page backdrop in any form: a rule with position: fixed and inset: 0, or fixed with top: 0 and left: 0, in any order.
    for (const block of src.match(/\{[^{}]*\}/g) ?? []) {
      if (!/position:\s*fixed/.test(block)) continue;
      const fullPage = /inset:\s*0\b/.test(block) || (/(^|[;{\s])top:\s*0\b/.test(block) && /(^|[;{\s])left:\s*0\b/.test(block));
      assert.ok(!fullPage, `${file}: its own full-page backdrop (use panelFrameCss): ${block.slice(0, 80)}`);
    }
  }
});

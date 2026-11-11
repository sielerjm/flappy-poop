import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('index.html has a mobile viewport meta with viewport-fit=cover', () => {
  assert.match(html, /<meta name="viewport" content="[^"]*width=device-width[^"]*viewport-fit=cover[^"]*"/);
});

test('index.html disables touch scrolling and zooming on the page', () => {
  assert.match(html, /touch-action:\s*none/);
  assert.match(html, /overscroll-behavior:\s*none/);
});

test('index.html loads Phaser pinned to an exact version from jsDelivr', () => {
  const m = html.match(/cdn\.jsdelivr\.net\/npm\/phaser@(\d+\.\d+\.\d+)\/dist\/phaser\.min\.js/);
  assert.ok(m, 'phaser script tag with exact x.y.z version not found');
  assert.equal(m[1].split('.')[0], '4', 'expected Phaser 4');
});

test('index.html loads src/main.js as an ES module', () => {
  assert.match(html, /<script type="module" src="src\/main\.js">/);
});

// The loading splash (src/splash.js reads these ids and classes; the CSS paints before any module).
const splashMarkup = (() => {
  const start = html.indexOf('<div id="splash"');
  const end = html.indexOf('<script>', start);
  assert.ok(start >= 0 && end > start, '#splash markup not found before the inline script');
  return html.slice(start, end);
})();

test('index.html has the splash: ring, poop, note card, ‹ ›, Continue', () => {
  for (const part of ['class="splash-ring spin"', 'class="splash-arc"', 'class="splash-poop" src="assets/poop.png"', 'id="splash-note"', 'class="label"', 'class="glyph"', 'class="text"', 'id="splash-prev"', 'id="splash-next"', 'id="splash-continue"']) {
    assert.ok(splashMarkup.includes(part), `splash markup lacks ${part}`);
  }
  assert.match(splashMarkup, /<button id="splash-continue" type="button" disabled>/, 'Continue starts disabled');
  assert.match(splashMarkup, /<circle class="splash-arc" cx="60" cy="60" r="54">/, 'r = 54 (the CSS dash is its circumference, 339.3)');
});

test('the splash markup carries no words: every one comes from src/i18n.js', () => {
  const text = splashMarkup.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '').trim();
  assert.equal(text, '');
});

test('the splash module is imported inline before the Phaser tag, so the cards show during its download', () => {
  const inline = html.indexOf("import('./src/splash.js')");
  const phaser = html.indexOf('cdn.jsdelivr.net/npm/phaser@');
  assert.ok(inline > 0 && phaser > 0 && inline < phaser);
  assert.ok(html.indexOf('<div id="splash"') < inline, 'the markup exists before the import can start it');
});

test('the splash colours are the pinned cream, brown and gold tokens', () => {
  assert.match(html, /--splash-bg: #ead0a9;/);
  assert.match(html, /--splash-brown: #7a4a21;/);
  assert.match(html, /--splash-glow: 255, 196, 64;/);
  assert.match(html, /prefers-reduced-motion: reduce/);
});

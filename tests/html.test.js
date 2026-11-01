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

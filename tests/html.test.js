import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

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

test('index.html has the splash: ring, poop, the ‹ card › row, Continue on its own row', () => {
  for (const part of ['class="splash-ring"', 'class="splash-arc"', 'class="splash-poop" src="assets/poop.png"', 'id="splash-note"', 'class="label"', 'class="art"', 'class="texts"', 'id="splash-prev"', 'id="splash-next"', 'id="splash-continue"']) {
    assert.ok(splashMarkup.includes(part), `splash markup lacks ${part}`);
  }
  assert.match(splashMarkup, /<button id="splash-continue" type="button" disabled>/, 'Continue starts disabled');
  assert.match(splashMarkup, /<circle class="splash-arc" cx="60" cy="60" r="54">/, 'r = 54 (the CSS dash is its circumference, 339.3)');
  const deck = splashMarkup.slice(splashMarkup.indexOf('<div class="splash-deck">'), splashMarkup.indexOf('<button id="splash-continue"'));
  assert.ok(/splash-prev[\s\S]*splash-note[\s\S]*splash-next/.test(deck), 'the deck row is ‹ card ›, Continue after it');
  assert.ok(!/\bspin\b/.test(html), 'no spinner: the ring only fills');
  assert.ok(!splashMarkup.includes('aria-live'), 'a card that changes by itself every few seconds does not interrupt a screen reader');
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

// The poop must never cross the ring: decode poop.png's alpha and place it as index.html's CSS does,
// at both ends of the bob. (A small PNG reader: 8-bit RGBA, non-interlaced, the five row filters.)
function pngAlpha(path) {
  const buf = readFileSync(path);
  let width = 0;
  let height = 0;
  const idat = [];
  for (let p = 8; p < buf.length; ) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.deepEqual([data[8], data[9], data[12]], [8, 6, 0], `${path}: expected 8-bit RGBA, not interlaced`);
    } else if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const alpha = new Uint8Array(width * height);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? line[x - 4] : 0;
      const b = prev[x];
      const c = x >= 4 ? prev[x - 4] : 0;
      const pa = Math.abs(b - c);
      const pb = Math.abs(a - c);
      const pc = Math.abs(a + b - 2 * c);
      const add = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      line[x] = (line[x] + add) & 255;
    }
    for (let x = 0; x < width; x += 1) alpha[y * width + x] = line[x * 4 + 3];
    prev = line;
  }
  return { width, height, alpha };
}

test('the poop stays inside the ring at both ends of its bob (2 % of the box clear)', () => {
  const block = (sel) => new RegExp(`${sel.replace('.', '\\.')} \\{([^}]*)\\}`).exec(html)?.[1] ?? '';
  const pct = (css, prop) => Number(new RegExp(`(?:^|[\\s;])${prop}: (-?[\\d.]+)%`).exec(css)?.[1]) / 100;
  const poop = block('.splash-poop');
  const box = { left: pct(poop, 'left'), top: pct(poop, 'top'), w: pct(poop, 'width'), h: pct(poop, 'height') };
  assert.ok(Object.values(box).every((v) => v > 0), `the poop's box from the CSS (${JSON.stringify(box)})`);
  const bob = Number(/@keyframes splash-bob \{ from \{ transform: translateY\(-([\d.]+)%\); \} to \{ transform: translateY\(([\d.]+)%\)/.exec(html)?.[2]) / 100;
  const stroke = Number(/\.splash-ring circle \{[^}]*stroke-width: ([\d.]+);/.exec(html)?.[1]);
  const r = Number(/class="splash-arc" cx="60" cy="60" r="(\d+)"/.exec(html)?.[1]);
  assert.ok(bob > 0 && stroke > 0 && r > 0, 'bob, stroke and r read from index.html');
  const inner = (r - stroke / 2) / 120; // the ring's inner edge, as a share of the hero box (viewBox 120)
  const { width, height, alpha } = pngAlpha(new URL('../assets/poop.png', import.meta.url));
  let worst = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] <= 32) continue;
      for (const dy of [-bob, bob]) {
        const px = box.left + box.w * ((x + 0.5) / width);
        const py = box.top + box.h * ((y + 0.5) / height + dy);
        worst = Math.max(worst, Math.hypot(px - 0.5, py - 0.5));
      }
    }
  }
  assert.ok(worst <= inner - 0.02, `the poop reaches ${worst.toFixed(3)} of the box from the centre; the ring starts at ${inner.toFixed(3)}`);
});

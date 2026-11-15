// The debug / automation handle (globalThis.__flappy, plan 30): set only on this machine or the local
// network, or when a driver opts in before the page loads (debugHandleAllowed in src/logic.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { debugHandleAllowed } from '../src/logic.js';

test('debugHandleAllowed: this machine, a .local name and private-network addresses; no public host', () => {
  for (const h of ['localhost', 'LOCALHOST', 'game.localhost', '127.0.0.1', '127.8.9.10', '::1', '[::1]', 'macbook.local', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.23']) {
    assert.equal(debugHandleAllowed(h), true, h);
  }
  for (const h of ['example.github.io', 'flappy.example.com', 'localhost.example.com', '8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.1.1', '11.0.0.1', '1.127.0.0', '10.0.0.256', '999.1.1.1', '', null, undefined, 'local']) {
    assert.equal(debugHandleAllowed(h), false, String(h));
  }
});

test('debugHandleAllowed: a driver that set globalThis.__flappyDebug = true before load gets the handle anywhere; nothing else counts as opting in', () => {
  assert.equal(debugHandleAllowed('example.github.io', true), true);
  for (const v of [false, 'true', 1, {}, null, undefined]) assert.equal(debugHandleAllowed('example.github.io', v), false, String(v));
});

test('src/ sets globalThis.__flappy once, in main.js, behind debugHandleAllowed with the pre-load opt-in', () => {
  const root = fileURLToPath(new URL('../src/', import.meta.url));
  const files = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js')) files.push(p);
    }
  };
  walk(root);
  const sets = files.flatMap((p) => [...readFileSync(p, 'utf8').matchAll(/globalThis\.__flappy\s*=(?!=)/g)].map(() => p));
  assert.deepEqual(sets.map((p) => p.slice(root.length)), ['main.js']);
  const main = readFileSync(join(root, 'main.js'), 'utf8');
  assert.match(main, /if \(debugHandleAllowed\(globalThis\.location\?\.hostname, globalThis\.__flappyDebug === true\)\) globalThis\.__flappy = game;/);
});

test('the smoke opts in before the page loads, so it runs against any URL', () => {
  const smoke = readFileSync(fileURLToPath(new URL('../tools/headless_check.mjs', import.meta.url)), 'utf8');
  const first = smoke.match(/Page\.addScriptToEvaluateOnNewDocument', \{ source: `([^`]*)` \}/);
  assert.ok(first && first[1].includes('globalThis.__flappyDebug = true;'), 'the pre-load script sets the opt-in');
});

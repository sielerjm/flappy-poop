import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('npm run smoke runs tools/headless_check.mjs', () => {
  assert.equal(pkg.scripts.smoke, 'node tools/headless_check.mjs');
});

test('headless_check covers every overlay scene registered in main.js', async () => {
  const { OVERLAYS, DEFAULT_URL } = await import('../tools/headless_check.mjs');
  const registered = /scene:\s*\[([^\]]+)\]/.exec(main)[1].split(',').map((s) => s.trim());
  const overlays = registered.filter((s) => !['Boot', 'Play', "new Play('PlayB')", 'Over', 'Versus'].includes(s));
  assert.deepEqual(Object.values(OVERLAYS).sort(), overlays.sort());
  assert.match(DEFAULT_URL, /^http:\/\/localhost:8000$/);
});

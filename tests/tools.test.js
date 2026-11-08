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

const smokeSrc = readFileSync(new URL('../tools/headless_check.mjs', import.meta.url), 'utf8');

test('smoke SECTIONS: unique kebab-case names, each says what it covers, needs only point backwards', async () => {
  const { SECTIONS } = await import('../tools/headless_check.mjs');
  assert.ok(SECTIONS.length >= 20, `expected the smoke's sections, got ${SECTIONS.length}`);
  const seen = [];
  for (const s of SECTIONS) {
    assert.match(s.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `section name ${s.name}`);
    assert.ok(!seen.includes(s.name), `section ${s.name} appears twice`);
    assert.ok(typeof s.about === 'string' && s.about.length > 10, `section ${s.name} has no about`);
    for (const n of s.needs ?? []) assert.ok(seen.includes(n), `${s.name} needs ${n}, which does not run before it`);
    seen.push(s.name);
  }
});

test("headless_check's section() calls run in SECTIONS order, each once", async () => {
  const { SECTIONS } = await import('../tools/headless_check.mjs');
  const calls = [...smokeSrc.matchAll(/await section\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(calls, SECTIONS.map((s) => s.name));
});

test('every subset stays hermetic: the gamepad stub precedes the page load; the leaderboard muzzle runs outside every section, before the first one that can submit a score', () => {
  const stub = smokeSrc.indexOf("Object.defineProperty(navigator, 'getGamepads'");
  const navigate = smokeSrc.indexOf("cdp.send('Page.navigate'");
  assert.ok(stub > 0 && navigate > stub, 'the gamepad stub is installed before Page.navigate');
  const muzzle = /^ {4}await evaluate\(`import\('\.\/src\/config\.js'\)\.then\(\(m\) => \{ m\.LEADERBOARD\.dataApi = ''; return true; \}\)`\);$/m.exec(smokeSrc);
  assert.ok(muzzle, "the muzzle (LEADERBOARD.dataApi = '') sits at run()'s top level, unwrapped");
  assert.ok(muzzle.index > smokeSrc.indexOf("await section('run'") && muzzle.index < smokeSrc.indexOf("await section('farts'"), 'the muzzle sits between the run and farts sections');
});

test('smoke parseArgs: URL, --url=, --list, --only; unknown names and options throw', async () => {
  const { parseArgs, DEFAULT_URL } = await import('../tools/headless_check.mjs');
  assert.deepEqual(parseArgs([]), { url: DEFAULT_URL, only: null, list: false });
  assert.deepEqual(parseArgs(['http://host:8000/']), { url: 'http://host:8000', only: null, list: false });
  assert.deepEqual(parseArgs(['--url=http://h:1', '--list']), { url: 'http://h:1', only: null, list: true });
  assert.deepEqual(parseArgs(['--only=wide, pad']).only, ['wide', 'pad']);
  assert.throws(() => parseArgs(['--only=nope']), /no section nope; the sections are home, /);
  assert.throws(() => parseArgs(['--only=']), /name at least one section/);
  assert.throws(() => parseArgs(['--fast']), /unknown option --fast/);
});

test('smoke expandOnly: a section brings what it needs, in run order; omitted needs mean every earlier section', async () => {
  const { expandOnly } = await import('../tools/headless_check.mjs');
  const fixture = [{ name: 'a' }, { name: 'b' }, { name: 'c', needs: [] }, { name: 'd', needs: ['c'] }, { name: 'e' }];
  assert.deepEqual(expandOnly(['b'], fixture), ['a', 'b']);
  assert.deepEqual(expandOnly(['d'], fixture), ['c', 'd']);
  assert.deepEqual(expandOnly(['d', 'a'], fixture), ['a', 'c', 'd']);
  assert.deepEqual(expandOnly(['e'], fixture), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(expandOnly(['home']), ['home']);
});

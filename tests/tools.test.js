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
  const overlays = registered.filter((s) => !['Boot', 'Play', "new Play('PlayB')", 'Over', 'Versus', 'OnlineRace'].includes(s)); // the match hosts are not overlays
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
  const pin = smokeSrc.indexOf('await pinClock(SMOKE_PIN_DAY)');
  assert.ok(pin > 0 && navigate > pin, "the clock pin (plan 17, 1.9) is installed before the first Page.navigate");
  const muzzle = /^ {4}await evaluate\(`import\('\.\/src\/config\.js'\)\.then\(\(m\) => \{ m\.LEADERBOARD\.dataApi = ''; return true; \}\)`\);$/m.exec(smokeSrc);
  assert.ok(muzzle, "the muzzle (LEADERBOARD.dataApi = '') sits at run()'s top level, unwrapped");
  assert.ok(muzzle.index > smokeSrc.indexOf("await section('run'") && muzzle.index < smokeSrc.indexOf("await section('farts'"), 'the muzzle sits between the run and farts sections');
});

test('smoke parseArgs: URL, --url=, --list, --only; unknown names and options throw', async () => {
  const { parseArgs, DEFAULT_URL } = await import('../tools/headless_check.mjs');
  assert.deepEqual(parseArgs([]), { url: DEFAULT_URL, only: null, list: false, date: null });
  assert.deepEqual(parseArgs(['http://host:8000/']), { url: 'http://host:8000', only: null, list: false, date: null });
  assert.deepEqual(parseArgs(['--url=http://h:1', '--list']), { url: 'http://h:1', only: null, list: true, date: null });
  assert.deepEqual(parseArgs(['--only=wide, pad']).only, ['wide', 'pad']);
  assert.throws(() => parseArgs(['--only=nope']), /no section nope; the sections are home, /);
  assert.throws(() => parseArgs(['--only=']), /name at least one section/);
  assert.throws(() => parseArgs(['--fast']), /unknown option --fast/);
});

test('smoke --date (plan 17, 1.9): a real day only; it overrides the pin for one run', async () => {
  const { parseArgs } = await import('../tools/headless_check.mjs');
  assert.equal(parseArgs(['--date=2026-12-05']).date, '2026-12-05');
  for (const bad of ['2026-12-32', '2026-02-29', '5 Dec', '2026-1-05', '']) assert.throws(() => parseArgs([`--date=${bad}`]), /is not a day/, bad);
});

test("the smoke's clock pin (plan 17, 1.9): off season by default; pinMs is the day's noon UTC", async () => {
  const { SMOKE_PIN_DAY, pinMs } = await import('../tools/headless_check.mjs');
  const { adventSeason } = await import('../src/logic.js');
  const { TUNING } = await import('../src/config.js');
  assert.equal(adventSeason(SMOKE_PIN_DAY, TUNING), false, 'every existing section was written for a day outside December');
  assert.equal(pinMs('2026-12-05'), Date.UTC(2026, 11, 5, 12));
  assert.equal(new Date(pinMs(SMOKE_PIN_DAY)).toISOString(), `${SMOKE_PIN_DAY}T12:00:00.000Z`);
});

test("the smoke's pins are absolute (plan 17, 1.16): a December host clock still runs every section on its pin; --date overrides them", async () => {
  const { pinOffset, pinMs, SMOKE_PIN_DAY } = await import('../tools/headless_check.mjs');
  for (const host of ['2026-12-01T00:00:01Z', '2026-12-05T08:00:00Z', '2026-12-31T23:59:59Z', '2027-01-01T00:00:00Z', '2026-11-15T03:00:00Z']) {
    const hostMs = Date.parse(host);
    const off = pinOffset(SMOKE_PIN_DAY, null, hostMs);
    assert.equal(off.want, SMOKE_PIN_DAY, host);
    assert.equal(new Date(hostMs + off.offsetMs).toISOString(), `${SMOKE_PIN_DAY}T12:00:00.000Z`, `a host on ${host}: the page reads the pin`);
    const xmas = pinOffset('2026-12-05', null, hostMs);
    assert.equal(hostMs + xmas.offsetMs, pinMs('2026-12-05'), `christmas's own pin from a host on ${host}`);
    assert.deepEqual(pinOffset(SMOKE_PIN_DAY, '2026-12-24', hostMs), { want: '2026-12-24', offsetMs: pinMs('2026-12-24') - hostMs }, '--date wins over the pin');
  }
});

test("the smoke's Date stub: now, new Date() and Date() shift by the offset and keep running; the rest of Date is unchanged", async () => {
  const { clockStubSource, pinMs } = await import('../tools/headless_check.mjs');
  const vm = await import('node:vm');
  const ctx = vm.createContext({});
  const RealInCtx = vm.runInContext('Date', ctx);
  const offset = pinMs('2026-12-05') - Date.now();
  vm.runInContext(clockStubSource(offset), ctx);
  const r = JSON.parse(vm.runInContext(`JSON.stringify({
    day: new Date().toISOString().slice(0, 10), nowDay: new Date(Date.now()).toISOString().slice(0, 10),
    str: typeof Date(), strDay: Date().slice(4, 15) === new Date().toString().slice(4, 15),
    fixed: new Date(0).getTime(), parts: new Date(2026, 0, 2).getDate(), utc: Date.UTC(2026, 0, 1), parse: Date.parse('2026-01-01T00:00:00Z'),
    inst: new Date() instanceof Date, name: Date.name, stub: globalThis.__smokeClock.offsetMs,
  })`, ctx));
  assert.deepEqual(r, { day: '2026-12-05', nowDay: '2026-12-05', str: 'string', strDay: true, fixed: 0, parts: 2, utc: Date.UTC(2026, 0, 1), parse: Date.UTC(2026, 0, 1), inst: true, name: 'Date', stub: offset });
  assert.ok(vm.runInContext('new Date()', ctx) instanceof RealInCtx, "a stubbed Date is still the context's real Date");
  const a = vm.runInContext('Date.now()', ctx);
  await new Promise((res) => setTimeout(res, 20));
  assert.ok(vm.runInContext('Date.now()', ctx) - a >= 15, 'the pinned clock keeps running');
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

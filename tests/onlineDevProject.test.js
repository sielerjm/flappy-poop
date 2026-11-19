// The test-project override for the first two-phone check (plan 39, item 38): on a dev host only (this
// machine or the LAN, like ?netsim and the debug handle), `?onlinetest=<code>` stores a test project's
// URL and publishable key in this browser, and the online client then talks to it; `?onlinetest=off`
// forgets it. The live project stays the default everywhere else, and nothing about it is in the repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEADERBOARD } from '../src/config.js';
import { DEV_PROJECT_KEY, devProjectFrom, encodeDevProject, onlineProjectConfig } from '../src/onlineNet.js';

const TEST = { url: 'https://abcdefghijklmnop.supabase.co', key: 'sb_publishable_TESTKEY123' };

function memory(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

test('the code round-trips, and only an https *.supabase.co project with a key is taken', () => {
  const code = encodeDevProject(TEST);
  assert.match(code, /^[A-Za-z0-9_-]+$/, 'URL-safe');
  assert.deepEqual(devProjectFrom(code), TEST);
  assert.deepEqual(devProjectFrom(encodeDevProject({ ...TEST, url: `${TEST.url}/` })), TEST, 'a trailing slash is dropped');
  for (const bad of [{ ...TEST, url: 'http://abcdefghijklmnop.supabase.co' }, { ...TEST, url: 'https://evil.example.com' }, { ...TEST, key: '' }, { url: TEST.url }]) assert.equal(devProjectFrom(encodeDevProject(bad)), null, JSON.stringify(bad));
  for (const junk of ['', 'not base64 !', 'e30', null, 42]) assert.equal(devProjectFrom(junk), null, String(junk));
});

test('on a dev host the param is stored, then used: the test project, its own session and trust keys', () => {
  const storage = memory();
  const r = onlineProjectConfig({ search: `?onlinetest=${encodeDevProject(TEST)}`, hostname: '192.168.1.20', storage });
  assert.equal(r.test, true);
  assert.equal(r.param, true, 'the caller strips it from the address');
  assert.equal(r.config.dataApi, `${TEST.url}/rest/v1`);
  assert.equal(r.config.publishableKey, TEST.key);
  assert.notEqual(r.config.onlineSessionKey, LEADERBOARD.onlineSessionKey, 'a test session never mixes with a live one');
  assert.notEqual(r.config.onlineTrustKey, LEADERBOARD.onlineTrustKey);
  assert.equal(r.config.flagsApi ?? LEADERBOARD.flagsApi, LEADERBOARD.flagsApi, 'the rest of the config is as it was');
  // Later loads, no param: still the test project.
  const again = onlineProjectConfig({ search: '', hostname: '192.168.1.20', storage });
  assert.equal(again.test, true);
  assert.equal(again.param, false);
  assert.equal(again.config.publishableKey, TEST.key);
  // off forgets it.
  const off = onlineProjectConfig({ search: '?onlinetest=off', hostname: 'localhost', storage });
  assert.equal(off.test, false);
  assert.equal(off.config, LEADERBOARD);
  assert.equal(storage.getItem(DEV_PROJECT_KEY), null);
});

test('anywhere but a dev host the live project, whatever the address or storage says (and storage is not touched)', () => {
  const storage = memory({ [DEV_PROJECT_KEY]: JSON.stringify(TEST) });
  for (const hostname of ['sielerjm.github.io', 'example.com', '']) {
    const r = onlineProjectConfig({ search: `?onlinetest=${encodeDevProject(TEST)}`, hostname, storage });
    assert.equal(r.test, false, hostname);
    assert.equal(r.config, LEADERBOARD, hostname);
  }
  assert.equal(storage.getItem(DEV_PROJECT_KEY), JSON.stringify(TEST));
  // A driver's opt-in (the smoke's) counts as a dev host, like the debug handle.
  assert.equal(onlineProjectConfig({ search: '', hostname: 'example.com', optIn: true, storage }).test, true);
});

test('blocked storage or a junk entry: the live project, never a throw', () => {
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(onlineProjectConfig({ search: `?onlinetest=${encodeDevProject(TEST)}`, hostname: 'localhost', storage: throwing }).config, LEADERBOARD);
  assert.equal(onlineProjectConfig({ search: '', hostname: 'localhost', storage: memory({ [DEV_PROJECT_KEY]: '{oops' }) }).config, LEADERBOARD);
  assert.equal(onlineProjectConfig({ search: '?onlinetest=junk', hostname: 'localhost', storage: memory() }).test, false);
});

test('Play reads the online config through it, and the repo holds no test project', () => {
  const play = readFileSync(new URL('../src/scenes/Play.js', import.meta.url), 'utf8');
  assert.match(play, /onlineProjectConfig\(/);
  assert.match(play, /createOnlineNet\(\{ config: /, 'the transport gets the resolved config');
  // The only supabase.co project named in src/ is the live one in config.js.
  const config = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
  const refs = new Set([...config.matchAll(/https:\/\/([a-z0-9]+)\.supabase\.co/g)].map((m) => m[1]));
  assert.equal(refs.size, 1, [...refs].join());
});

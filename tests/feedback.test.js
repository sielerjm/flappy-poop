import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { issueUrl, openExternalUrl, reloadUrl, reloadGame, loadedScriptUrls, hardReloadGame, VERSION } from '../src/logic.js';
import { t, LOCALES } from '../src/i18n.js';

test('issueUrl returns GitHub new-issue template URLs for bug and feature', () => {
  assert.equal(issueUrl('bug'), 'https://github.com/sielerjm/flappy-poop/issues/new?template=bug.yml');
  assert.equal(
    issueUrl('feature'),
    'https://github.com/sielerjm/flappy-poop/issues/new?template=feature.yml',
  );
  assert.throws(() => issueUrl('other'), /unknown kind/);
});

// E4 (plan 21): the 🚩 on an education quiz card opens the card report form with the card's code filled in.
test("issueUrl('card'): the education form (plan 28, 2.5: education.yml replaces card.yml), the card's code in the title and in the form's card-id field, the version in its version field", () => {
  const url = new URL(issueUrl('card', { cardId: 'ST-03', version: '9.8.7' }));
  assert.equal(`${url.origin}${url.pathname}`, 'https://github.com/sielerjm/flappy-poop/issues/new');
  assert.deepEqual(Object.fromEntries(url.searchParams), { template: 'education.yml', title: '[Card ST-03] ', 'card-id': 'ST-03', version: 'v9.8.7' });
  assert.equal(new URL(issueUrl('card', { cardId: 'JE-06' })).searchParams.get('version'), `v${VERSION}`, 'this build by default');
  const odd = issueUrl('card', { cardId: ' A&B #1 ' });
  assert.ok(!/[ #]/.test(odd.slice(odd.indexOf('?'))), `the query is encoded (${odd})`);
  assert.equal(new URL(odd).searchParams.get('card-id'), 'A&B #1', 'and decodes to the trimmed code');
  assert.equal(new URL(issueUrl('card')).searchParams.get('title'), '[Card ] ', 'no code: still a card report');
  // The fields the URL fills in are the form's: the template declares both ids, its kinds and the education label.
  const form = readFileSync(new URL('../.github/ISSUE_TEMPLATE/education.yml', import.meta.url), 'utf8');
  for (const id of ['kind', 'card-id', 'details', 'version']) assert.match(form, new RegExp(`^\\s+id: ${id}$`, 'm'), `education.yml has the ${id} field`);
  assert.match(form, /^labels: \["education"\]$/m);
  for (const kind of ['A card is wrong', 'An explanation is unclear', 'A link is broken', 'An idea for a card', 'Something else']) assert.ok(form.includes(`- ${kind}`), kind);
  assert.match(form, /never post personal data/i, 'a privacy line');
  assert.ok(!existsSync(new URL('../.github/ISSUE_TEMPLATE/card.yml', import.meta.url)), 'card.yml is gone');
  assert.equal(issueUrl('education'), 'https://github.com/sielerjm/flappy-poop/issues/new?template=education.yml', 'the form with no card (the Education data panel links it)');
});

test('openExternalUrl uses window.open when it returns a window', () => {
  let opened = null;
  const win = { opener: 'parent' };
  const api = {
    open(url, target) {
      opened = { url, target };
      return win;
    },
    location: {
      assign() {
        assert.fail('assign should not run when open succeeds');
      },
    },
  };
  const url = issueUrl('feature');
  assert.equal(openExternalUrl(url, api), 'window');
  assert.deepEqual(opened, { url, target: '_blank' });
  assert.equal(win.opener, null);
});

test('openExternalUrl falls back to location.assign when open is blocked', () => {
  let assigned = null;
  const api = {
    open() {
      return null;
    },
    location: {
      assign(url) {
        assigned = url;
      },
    },
  };
  const url = issueUrl('bug');
  assert.equal(openExternalUrl(url, api), 'navigate');
  assert.equal(assigned, url);
});

test('openExternalUrl returns none when no opener is available', () => {
  assert.equal(openExternalUrl(issueUrl('bug'), {}), 'none');
});

test('feedback catalog keys resolve in both locales', () => {
  for (const locale of LOCALES) {
    for (const key of ['feedbackTitle', 'feedbackBody', 'bugReport', 'featureRequest', 'feedbackLink']) {
      const value = t(locale, key);
      assert.equal(typeof value, 'string');
      assert.ok(value.length > 0, `${locale} ${key} empty`);
    }
  }
});

test('reloadUrl adds a fresh r= query, replaces an old one, and drops the hash', () => {
  assert.equal(reloadUrl('https://x.test/flappy-poop/', 42), 'https://x.test/flappy-poop/?r=42');
  assert.equal(reloadUrl('https://x.test/flappy-poop/?r=1&a=b#frag', 99), 'https://x.test/flappy-poop/?a=b&r=99');
  assert.equal(reloadUrl('http://localhost:8000/?cb=5', 7), 'http://localhost:8000/?cb=5&r=7');
});

test('reloadGame navigates via location.replace and no-ops without a location', () => {
  const calls = [];
  const api = { location: { href: 'https://x.test/game/?r=1', replace: (u) => calls.push(u) } };
  const used = reloadGame(api);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], used);
  assert.match(used, /^https:\/\/x\.test\/game\/\?r=\d+$/);
  assert.notEqual(used, 'https://x.test/game/?r=1');
  assert.equal(reloadGame({}), null);
});

const ORIGIN = 'https://x.test';
const ENTRIES = [
  { name: `${ORIGIN}/game/src/main.js` },
  { name: `${ORIGIN}/game/src/scenes/Play.js` },
  { name: `${ORIGIN}/game/src/main.js` }, // duplicate
  { name: 'https://cdn.jsdelivr.net/npm/phaser@4.2.1/dist/phaser.min.js' }, // cross-origin, skipped
  { name: `${ORIGIN}/game/assets/poop.png?v=0.5.10` }, // asset, skipped
  { name: `${ORIGIN}/game/assets/sfx/fart.mp3?v=0.5.10` },
  { name: `${ORIGIN}/game/src/save.js?x=1` }, // query allowed
  { name: 42 },
];

test('loadedScriptUrls keeps same-origin scripts and the page, drops CDN, assets, and duplicates', () => {
  const api = {
    location: { origin: ORIGIN, href: `${ORIGIN}/game/?r=1#frag` },
    performance: { getEntriesByType: (type) => (type === 'resource' ? ENTRIES : []) },
  };
  assert.deepEqual(loadedScriptUrls(api), [
    `${ORIGIN}/game/?r=1`,
    `${ORIGIN}/game/src/main.js`,
    `${ORIGIN}/game/src/scenes/Play.js`,
    `${ORIGIN}/game/src/save.js?x=1`,
  ]);
  assert.deepEqual(loadedScriptUrls({}), []);
  assert.deepEqual(loadedScriptUrls({ location: { origin: ORIGIN, href: `${ORIGIN}/` } }), [`${ORIGIN}/`]);
});

function fakeApi({ fetch, setTimeout } = {}) {
  const calls = [];
  const api = {
    location: { origin: ORIGIN, href: `${ORIGIN}/game/?r=1`, replace: (u) => calls.push(['replace', u]) },
    performance: { getEntriesByType: () => ENTRIES },
    fetch: fetch ?? ((u, opts) => { calls.push(['fetch', u, opts]); return Promise.resolve({ ok: true }); }),
    setTimeout: setTimeout ?? ((fn) => fn()),
  };
  return { api, calls };
}

test('hardReloadGame re-fetches every loaded script with cache: reload before navigating', async () => {
  const { api, calls } = fakeApi({ setTimeout: () => {} }); // timer never fires: fetches must complete on their own
  const used = await hardReloadGame(api);
  const fetches = calls.filter((c) => c[0] === 'fetch');
  assert.equal(fetches.length, 4);
  assert.ok(fetches.every((c) => c[2].cache === 'reload'));
  assert.deepEqual(fetches.map((c) => c[1]), loadedScriptUrls(api));
  assert.equal(calls.at(-1)[0], 'replace');
  assert.equal(calls.at(-1)[1], used);
  assert.match(used, /^https:\/\/x\.test\/game\/\?r=\d+$/);
});

test('hardReloadGame still navigates when a fetch rejects, hangs, or fetch is missing', async () => {
  const rejecting = fakeApi({ fetch: () => Promise.reject(new Error('offline')), setTimeout: () => {} });
  assert.match(await hardReloadGame(rejecting.api), /\?r=\d+$/);
  assert.equal(rejecting.calls.filter((c) => c[0] === 'replace').length, 1);

  const hanging = fakeApi({ fetch: () => new Promise(() => {}) }); // fake timer fires at once
  assert.match(await hardReloadGame(hanging.api, { timeoutMs: 1 }), /\?r=\d+$/);

  const noFetch = fakeApi(); delete noFetch.api.fetch; delete noFetch.api.performance;
  assert.match(await hardReloadGame(noFetch.api), /\?r=\d+$/);

  assert.equal(await hardReloadGame({}), null);
});

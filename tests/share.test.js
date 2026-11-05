import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataUrlToBytes, shareMode, shareScoreImage } from '../src/share.js';

// The 8-byte PNG signature plus the start of an IHDR chunk, as a data URL.
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
const PNG_URL = `data:image/png;base64,${Buffer.from(PNG_HEAD).toString('base64')}`;
const FILE = { name: 'flappy-poop-score.png', type: 'image/png', size: 12 };

/** Fake navigator: canShare answers `can`; share() resolves, or rejects / throws with `error`. */
function fakeNav({ can = true, error = null, throwSync = false } = {}) {
  const calls = [];
  return {
    calls,
    canShare: () => can,
    share(data) {
      calls.push(data);
      if (throwSync) throw error;
      return error ? Promise.reject(error) : Promise.resolve();
    },
  };
}

/** Fake document + URL that record the download link's click and the revoke. */
function fakeDoc({ throws = false } = {}) {
  const clicks = [];
  const revoked = [];
  const doc = {
    body: { appendChild() {} },
    createElement(tag) {
      if (throws) throw new Error('no DOM');
      const a = { tag, click: () => clicks.push({ href: a.href, download: a.download }), remove() {} };
      return a;
    },
  };
  const urlApi = { createObjectURL: () => 'blob:fake', revokeObjectURL: (u) => revoked.push(u) };
  return { doc, urlApi, clicks, revoked };
}

const abort = () => Object.assign(new Error('closed'), { name: 'AbortError' });

test('dataUrlToBytes decodes a base64 data URL synchronously', () => {
  const out = dataUrlToBytes(PNG_URL);
  assert.equal(out.type, 'image/png');
  assert.deepEqual([...out.bytes], PNG_HEAD);
  assert.equal(dataUrlToBytes('data:text/plain,hello'), null, 'not base64');
  assert.equal(dataUrlToBytes('https://example.com/x.png'), null);
  assert.equal(dataUrlToBytes(undefined), null);
});

test('shareMode: the share sheet when it takes files, else a download, else nothing', () => {
  const { doc } = fakeDoc();
  assert.equal(shareMode(fakeNav({ can: true }), FILE, doc), 'share');
  assert.equal(shareMode(fakeNav({ can: false }), FILE, doc), 'download');
  assert.equal(shareMode({ share() {} }, FILE, doc), 'download', 'share() without canShare cannot take files');
  assert.equal(shareMode({ share() {}, canShare() { throw new Error('bad'); } }, FILE, doc), 'download');
  assert.equal(shareMode(undefined, FILE, doc), 'download');
  assert.equal(shareMode(undefined, FILE, undefined), null);
});

test('shareScoreImage calls share() synchronously, inside the tap, with the file, title and text', async () => {
  const nav = fakeNav();
  const { doc, urlApi, clicks } = fakeDoc();
  const pending = shareScoreImage({ file: FILE, title: 'Flappy Poop', text: 'I scored 9', nav, doc, urlApi });
  assert.equal(nav.calls.length, 1, 'share() ran before the first await');
  assert.deepEqual(nav.calls[0], { files: [FILE], title: 'Flappy Poop', text: 'I scored 9' });
  assert.equal(await pending, 'shared');
  assert.equal(clicks.length, 0);
});

test('closing the share sheet is a cancel, not a download', async () => {
  const { doc, urlApi, clicks } = fakeDoc();
  assert.equal(await shareScoreImage({ file: FILE, nav: fakeNav({ error: abort() }), doc, urlApi }), 'cancelled');
  assert.equal(await shareScoreImage({ file: FILE, nav: fakeNav({ error: abort(), throwSync: true }), doc, urlApi }), 'cancelled');
  assert.equal(clicks.length, 0);
});

test('any other share failure falls back to downloading the PNG', async () => {
  const notAllowed = Object.assign(new Error('no'), { name: 'NotAllowedError' });
  const { doc, urlApi, clicks } = fakeDoc();
  assert.equal(await shareScoreImage({ file: FILE, nav: fakeNav({ error: notAllowed }), doc, urlApi }), 'downloaded');
  assert.equal(await shareScoreImage({ file: FILE, nav: fakeNav({ error: new TypeError('x'), throwSync: true }), doc, urlApi }), 'downloaded');
  assert.equal(clicks.length, 2);
});

test('without a share sheet for files the PNG downloads under its file name, and the URL is revoked', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { doc, urlApi, clicks, revoked } = fakeDoc();
  assert.equal(await shareScoreImage({ file: FILE, nav: fakeNav({ can: false }), doc, urlApi }), 'downloaded');
  assert.deepEqual(clicks, [{ href: 'blob:fake', download: FILE.name }]);
  assert.deepEqual(revoked, []);
  t.mock.timers.tick(10000);
  assert.deepEqual(revoked, ['blob:fake']);
});

test('shareScoreImage never rejects: no file, no DOM, or a throwing document all resolve failed', async () => {
  assert.equal(await shareScoreImage({ file: null, nav: fakeNav() }), 'failed');
  assert.equal(await shareScoreImage({ file: FILE, nav: undefined, doc: undefined }), 'failed');
  const { doc, urlApi } = fakeDoc({ throws: true });
  assert.equal(await shareScoreImage({ file: FILE, nav: fakeNav({ can: false }), doc, urlApi }), 'failed');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueUrl, openExternalUrl } from '../src/logic.js';
import { t, LOCALES } from '../src/i18n.js';

test('issueUrl returns GitHub new-issue template URLs for bug and feature', () => {
  assert.equal(issueUrl('bug'), 'https://github.com/sielerjm/flappy-poop/issues/new?template=bug.yml');
  assert.equal(
    issueUrl('feature'),
    'https://github.com/sielerjm/flappy-poop/issues/new?template=feature.yml',
  );
  assert.throws(() => issueUrl('other'), /unknown kind/);
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

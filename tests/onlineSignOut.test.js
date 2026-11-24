// Sign out and a Sign in or Merge that brings another player's id leave online play (plan 39, 1.6a;
// Preview B's B6, item 37; plan 44 renamed Clear and Load): the save panel says so and asks Play to
// unlink and forget the session, but only on a device that holds one, so a device never online loads
// no client. Play builds the online account once, on its own save.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './support/dom.js';
import { playScene, fakeStorage } from './support/scenes.js';

const body = installDom();
const { openSavePanel, closeSavePanel } = await import('../src/ui/savePanel.js');
const { t } = await import('../src/i18n.js');
const { exportCode } = await import('../src/save.js');
const { LEADERBOARD } = await import('../src/config.js');
const { pageStorage } = await import('../src/store.js');

const ID = 'C'.repeat(22);
const OTHER = 'D'.repeat(22);
const tick = () => new Promise((r) => setTimeout(r, 5));

function fakePlay({ held = false, id = ID, name = 'Clearer' } = {}) {
  const calls = [];
  let save = { id, name, top: [] };
  return {
    calls,
    getSaveState: () => save,
    setSaveState: (s) => (save = s),
    signOut: () => calls.push('signOut'),
    onlineSessionHeld: () => held,
    onlineLeave: async () => calls.push('onlineLeave'),
    educationAvailable: () => true,
    eduShareOn: () => false,
    researchConsent: () => null,
    eduHasCards: () => false,
    syncLeaderboard: () => {},
    forgetRename: () => {},
    forgetBoardCache: () => {},
    noteRename: () => {},
    queueMerge: () => true,
  };
}

const panel = () => body.find('save-panel') ?? body.children.find((c) => c.attrs?.role === 'dialog');

/** Sign out through its confirm (plan 44); returns the confirm's notes. */
async function signOut(play) {
  globalThis.localStorage = fakeStorage();
  openSavePanel({ game: {}, play, locale: 'en' });
  const root = panel();
  await root.find('save-clear-btn').click();
  const notes = root.find('save-logout-notes').textContent;
  await root.find('save-logout-confirm').click();
  await tick();
  closeSavePanel();
  return notes;
}

test("Sign out's confirm names online play only on a device holding a session", async () => {
  assert.ok((await signOut(fakePlay({ held: true }))).includes(t('en', 'saveClearNoteOnline')));
  assert.ok(!(await signOut(fakePlay({ held: false }))).includes(t('en', 'saveClearNoteOnline')));
});

test('Sign out leaves online play (unlink, then forget), and only with a session', async () => {
  const held = fakePlay({ held: true });
  await signOut(held);
  assert.deepEqual(held.calls.sort(), ['onlineLeave', 'signOut']);
  const never = fakePlay({ held: false });
  await signOut(never);
  assert.deepEqual(never.calls, ['signOut']);
});

/**
 * Bring `codeId`'s code in as today's Load did: signed out, Sign in; signed in, Merge with the code's
 * player kept (a tap on its card). Returns the status line.
 */
async function load(play, codeId) {
  globalThis.localStorage = fakeStorage();
  const code = await exportCode({ id: codeId, name: 'Loader', top: [] }, { storage: globalThis.localStorage });
  openSavePanel({ game: {}, play, locale: 'en' });
  const root = panel();
  const signedIn = Boolean(play.getSaveState().name);
  await root.find(signedIn ? 'save-merge-btn' : 'save-have-btn').click();
  const field = root.find(signedIn ? 'save-merge-input' : 'save-load');
  field.value = code;
  await field.fire('input');
  if (signedIn) {
    await root.find('save-card-code')?.click();
    await root.find('save-merge-confirm').click();
  } else await root.find('save-load-btn').click();
  await tick();
  const status = root.find('save-status').textContent;
  closeSavePanel();
  return status;
}

test("a Sign in or Merge that brings another player's id leaves online play and says so; this player's own code does not", async () => {
  for (const name of ['', 'Clearer']) {
    const other = fakePlay({ held: true, name });
    const status = await load(other, OTHER);
    assert.ok(other.calls.includes('onlineLeave'), `name "${name}"`);
    assert.ok(status.endsWith(t('en', 'saveLoadedNoteOnline')), status);
    const same = fakePlay({ held: true, name });
    const again = await load(same, ID);
    assert.ok(!same.calls.includes('onlineLeave'));
    assert.ok(!again.includes(t('en', 'saveLoadedNoteOnline')));
    const never = fakePlay({ held: false, name });
    await load(never, OTHER);
    assert.ok(!never.calls.includes('onlineLeave'));
  }
});

test('Play.onlineSessionHeld reads the session key, in storage or in this page load when storage is blocked', () => {
  globalThis.localStorage = fakeStorage();
  const p = playScene({});
  assert.equal(p.onlineSessionHeld(), false);
  globalThis.localStorage.setItem(LEADERBOARD.onlineSessionKey, '{"access_token":"x"}');
  assert.equal(p.onlineSessionHeld(), true);
  globalThis.localStorage = fakeStorage(new Map(), { getThrows: true });
  pageStorage().setItem(LEADERBOARD.onlineSessionKey, '{"access_token":"y"}');
  assert.equal(p.onlineSessionHeld(), true);
  pageStorage().removeItem(LEADERBOARD.onlineSessionKey);
  assert.equal(p.onlineSessionHeld(), false);
});

test("Play.onlineAccount: one account on Play's own save; a claimed name is stored the save panel's way", async () => {
  globalThis.localStorage = fakeStorage();
  const seen = [];
  const net = {
    signIn: async () => ({ ok: true }),
    rpc: async (fn, args) => (seen.push([fn, args]), fn === 'link_online_player' ? { ok: true, data: { trusted: true, name: args.p_name } } : { ok: false, error: 'offline' }),
    signOut: async () => {},
  };
  const p = playScene({ save: { id: null, name: '', top: [] }, onlineNet: net, renamed: [], synced: 0 });
  p.setSaveState = (s) => (p.save = s);
  p.noteRename = (n) => p.renamed.push(n);
  p.syncLeaderboard = () => (p.synced += 1);
  p.checkNameAvailable = async () => true;
  assert.equal(p.onlineAccount(), p.onlineAccount());
  const r = await p.onlineAccount().claim('FreshPoop');
  assert.equal(r.ok, true);
  assert.equal(p.save.name, 'FreshPoop');
  assert.match(p.save.id, /^[A-Za-z0-9_-]{22}$/); // given an id for the link
  assert.equal(seen.find((c) => c[0] === 'link_online_player')[1].p_player_id, p.save.id);
  assert.deepEqual(p.renamed, ['FreshPoop']);
  assert.equal(p.synced, 1);
  assert.equal(p.onlineLeave.length, 0);
});

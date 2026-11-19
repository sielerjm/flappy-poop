// Clear and Load leave online play (plan 39, 1.6a; Preview B's B6, item 37): the save panel says so
// and asks Play to unlink and forget the session, but only on a device that holds one, so a device
// never online loads no client. Play builds the online account once, on its own save.
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

function fakePlay({ held = false, id = ID } = {}) {
  const calls = [];
  let save = { id, name: 'Clearer', top: [] };
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
  };
}

const panel = () => body.find('save-panel') ?? body.children.find((c) => c.attrs?.role === 'dialog');

async function clearTwice(play) {
  globalThis.localStorage = fakeStorage();
  openSavePanel({ game: {}, play, locale: 'en' });
  const root = panel();
  await root.find('save-clear-btn').click();
  const warning = root.find('save-status').textContent;
  await root.find('save-clear-btn').click();
  await tick();
  closeSavePanel();
  return warning;
}

test("Clear's warning names online play only on a device holding a session", async () => {
  assert.ok((await clearTwice(fakePlay({ held: true }))).includes(t('en', 'saveClearNoteOnline')));
  assert.ok(!(await clearTwice(fakePlay({ held: false }))).includes(t('en', 'saveClearNoteOnline')));
});

test('the second Clear leaves online play (unlink, then forget), and only with a session', async () => {
  const held = fakePlay({ held: true });
  await clearTwice(held);
  assert.deepEqual(held.calls.sort(), ['onlineLeave', 'signOut']);
  const never = fakePlay({ held: false });
  await clearTwice(never);
  assert.deepEqual(never.calls, ['signOut']);
});

async function load(play, codeId) {
  globalThis.localStorage = fakeStorage();
  const code = await exportCode({ id: codeId, name: 'Loader', top: [] }, { storage: globalThis.localStorage });
  openSavePanel({ game: {}, play, locale: 'en' });
  const root = panel();
  root.find('save-load').value = code;
  await root.find('save-load-btn').click();
  await tick();
  const status = root.find('save-status').textContent;
  closeSavePanel();
  return status;
}

test("a Load of another player leaves online play and says so; reloading this player's own code does not", async () => {
  const other = fakePlay({ held: true });
  const status = await load(other, OTHER);
  assert.ok(other.calls.includes('onlineLeave'));
  assert.ok(status.endsWith(t('en', 'saveLoadedNoteOnline')), status);
  const same = fakePlay({ held: true });
  const again = await load(same, ID);
  assert.ok(!same.calls.includes('onlineLeave'));
  assert.ok(!again.includes(t('en', 'saveLoadedNoteOnline')));
  const never = fakePlay({ held: false });
  await load(never, OTHER);
  assert.ok(!never.calls.includes('onlineLeave'));
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

// The online sign-in side (plan 39, 1.6a): src/onlineAccount.js on a fake createOnlineNet. Entering 🌐
// signs in and links the save's id and name (M1: the first device is trusted, later ones wait);
// the name claim follows the board's rules then the server's both-ways claim; the device list,
// remove, the pairing code and pair; Clear / Load leave online play, and never load the client
// on a device that was never online.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOnlineAccount, deviceRows, signInKey, linkKey, PAIR_CODE_TTL_MS } from '../src/onlineAccount.js';
import { catalogFor } from '../src/i18n.js';

const ID = 'a'.repeat(22);
const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 19, 12);

function fakeNet(answers = {}) {
  const calls = [];
  const net = {
    calls,
    signInResult: { ok: true, uid: 'u-me' },
    async signIn() {
      calls.push(['signIn']);
      return net.signInResult;
    },
    async rpc(fn, args = {}) {
      calls.push(['rpc', fn, args]);
      const a = answers[fn];
      if (typeof a === 'function') return a(args);
      return a ?? { ok: false, error: 'offline' };
    },
    async signOut() {
      calls.push(['signOut']);
    },
  };
  return net;
}

function setup({ answers = {}, save = { id: ID, name: 'PlopMaster' }, session = true, checkName = async () => true, trusted = undefined, blocked = false } = {}) {
  const net = fakeNet(answers);
  const state = { save: { ...save }, stored: [], trust: trusted };
  const account = createOnlineAccount({
    net,
    getSave: () => state.save,
    saveWithId: () => {
      if (!state.save.id) state.save = { ...state.save, id: ID };
      return state.save;
    },
    storeName: (name) => {
      state.save = { ...state.save, name };
      state.stored.push(name);
    },
    checkName,
    hasSession: () => session,
    trust: { get: () => state.trust, set: (v) => (state.trust = v) },
    storageBlocked: () => blocked,
    now: () => NOW,
  });
  return { net, state, account };
}

const linked = (trusted = true, name = 'PlopMaster') => ({ link_online_player: (args) => ({ ok: true, data: { trusted, name: args.p_name ?? name } }) });

test('every key the account returns exists in both locales', () => {
  const en = catalogFor('en');
  const zh = catalogFor('zh-Hans');
  for (const err of ['disabled', 'load failed', 'rate limited', 'offline', 'error', 'whatever']) {
    assert.ok(en[signInKey(err)] && zh[signInKey(err)], `sign-in ${err} → ${signInKey(err)}`);
  }
  for (const err of ['name taken', 'bad name', 'too many devices waiting', 'rate limited', 'offline', 'not trusted', 'whatever']) {
    assert.ok(en[linkKey(err)] && zh[linkKey(err)], `link ${err} → ${linkKey(err)}`);
  }
  for (const k of ['onlineNameTaken', 'onlinePairWrong', 'onlinePairBurned', 'onlinePairNoCode', 'onlineErrGeneric', 'saveNameShort', 'saveNameRequired']) {
    assert.ok(en[k] && zh[k], k);
  }
});

test('sign-in errors map to their messages (item 28: the rate limit has its own)', () => {
  assert.equal(signInKey('rate limited'), 'onlineSignInLimited');
  assert.equal(signInKey('disabled'), 'onlineDisabled');
  assert.equal(signInKey('load failed'), 'onlineLoadFailed');
  assert.equal(signInKey('offline'), 'onlineErrOffline');
  assert.equal(signInKey('error'), 'onlineErrGeneric');
  assert.equal(signInKey(undefined), 'onlineErrGeneric');
});

test('enter: a refused sign-in says why and links nothing', async () => {
  const { net, account } = setup({ answers: linked() });
  net.signInResult = { ok: false, error: 'rate limited' };
  const r = await account.enter();
  assert.deepEqual(r, { ok: false, errorKey: 'onlineSignInLimited' });
  assert.ok(!net.calls.some((c) => c[1] === 'link_online_player'));
});

test('enter: no username yet asks for one before any link', async () => {
  const { net, account } = setup({ save: { id: null, name: '' }, answers: linked() });
  const r = await account.enter();
  assert.equal(r.ok, true);
  assert.equal(r.view, 'noname');
  assert.ok(!net.calls.some((c) => c[1] === 'link_online_player'));
});

test('enter: links the save id and name; the first device comes back trusted', async () => {
  const { net, account, state } = setup({ answers: linked(true) });
  const r = await account.enter();
  assert.deepEqual(r, { ok: true, view: 'home', name: 'PlopMaster', trusted: true, demoted: false, blocked: false });
  assert.deepEqual(net.calls.find((c) => c[1] === 'link_online_player')[2], { p_player_id: ID, p_name: 'PlopMaster' });
  assert.equal(state.trust, true);
  assert.deepEqual(account.status(), { linked: true, trusted: true, name: 'PlopMaster' });
});

test('enter: a save without an id gets one before the link', async () => {
  const { net, account } = setup({ save: { id: null, name: 'PlopMaster' }, answers: linked(true) });
  await account.enter();
  assert.equal(net.calls.find((c) => c[1] === 'link_online_player')[2].p_player_id, ID);
});

test('enter: a later device waits to pair; one that was trusted here before is told it was demoted (M1 rule 5)', async () => {
  const fresh = setup({ answers: linked(false) });
  const a = await fresh.account.enter();
  assert.equal(a.trusted, false);
  assert.equal(a.demoted, false);
  const was = setup({ answers: linked(false), trusted: true });
  const b = await was.account.enter();
  assert.equal(b.demoted, true);
  assert.equal(was.state.trust, false);
});

test('enter: blocked storage is reported, and play goes on', async () => {
  const { account } = setup({ answers: linked(true), blocked: true });
  const r = await account.enter();
  assert.equal(r.ok, true);
  assert.equal(r.blocked, true);
});

test('enter: a name held online by another player asks for a new name; other refusals say why', async () => {
  const taken = setup({ answers: { link_online_player: { ok: false, error: 'name taken' } } });
  const r = await taken.account.enter();
  assert.deepEqual(r, { ok: true, view: 'noname', errorKey: 'onlineNameTaken', blocked: false });
  const many = setup({ answers: { link_online_player: { ok: false, error: 'too many devices waiting' } } });
  assert.deepEqual(await many.account.enter(), { ok: false, errorKey: 'onlineTooManyWaiting' });
  const off = setup({ answers: { link_online_player: { ok: false, error: 'offline' } } });
  assert.deepEqual(await off.account.enter(), { ok: false, errorKey: 'onlineErrOffline' });
});

test('claim: the board rules first, with no request for a bad name', async () => {
  const { net, account } = setup({ save: { id: null, name: '' }, answers: linked() });
  await account.enter();
  assert.deepEqual(await account.claim('ab'), { ok: false, errorKey: 'saveNameShort' });
  assert.deepEqual(await account.claim('has space'), { ok: false, errorKey: 'saveNameSpace' });
  assert.deepEqual(await account.claim('   '), { ok: false, errorKey: 'saveNameRequired' });
  assert.ok(!net.calls.some((c) => c[1] === 'link_online_player'));
});

test('claim: a name taken on the board stops before the link; a free one is linked, then stored', async () => {
  const takenBoard = setup({ save: { id: null, name: '' }, answers: linked(), checkName: async () => false });
  await takenBoard.account.enter();
  assert.deepEqual(await takenBoard.account.claim('FreshPoop'), { ok: false, errorKey: 'onlineNameTaken' });
  assert.ok(!takenBoard.net.calls.some((c) => c[1] === 'link_online_player'));
  assert.deepEqual(takenBoard.state.stored, []);

  const free = setup({ save: { id: null, name: '' }, answers: linked(true), checkName: async () => null }); // the board cannot say: the server's claim decides
  await free.account.enter();
  const r = await free.account.claim('FreshPoop');
  assert.deepEqual(r, { ok: true, view: 'home', name: 'FreshPoop', trusted: true, demoted: false, blocked: false });
  assert.deepEqual(free.net.calls.find((c) => c[1] === 'link_online_player')[2], { p_player_id: ID, p_name: 'FreshPoop' });
  assert.deepEqual(free.state.stored, ['FreshPoop']);
});

test('claim: the server refusing the name stores nothing', async () => {
  const { account, state } = setup({ save: { id: null, name: '' }, answers: { link_online_player: { ok: false, error: 'name taken' } } });
  await account.enter();
  assert.deepEqual(await account.claim('FreshPoop'), { ok: false, errorKey: 'onlineNameTaken' });
  assert.deepEqual(state.stored, []);
});

test('deviceRows: this device first, each with days since it was seen (paired) or added (waiting)', () => {
  const rows = deviceRows(
    [
      { device: 'u-old', linked_at: new Date(NOW - 10 * DAY).toISOString(), seen_at: new Date(NOW - 3 * DAY - 1000).toISOString(), trusted: true, this_device: false },
      { device: 'u-me', linked_at: new Date(NOW - 9 * DAY).toISOString(), seen_at: new Date(NOW - 60000).toISOString(), trusted: true, this_device: true },
      { device: 'u-new', linked_at: new Date(NOW - 3600000).toISOString(), seen_at: null, trusted: false, this_device: false },
    ],
    NOW,
  );
  assert.deepEqual(rows, [
    { uid: 'u-me', me: true, trusted: true, days: 0 },
    { uid: 'u-old', me: false, trusted: true, days: 3 },
    { uid: 'u-new', me: false, trusted: false, days: 0 },
  ]);
  assert.deepEqual(deviceRows(null, NOW), []);
});

test('devices: a waiting device is told so without asking the server; a paired one gets the list', async () => {
  const waiting = setup({ answers: linked(false) });
  await waiting.account.enter();
  assert.deepEqual(await waiting.account.devices(), { ok: false, pending: true });
  assert.ok(!waiting.net.calls.some((c) => c[1] === 'online_devices'));

  const rows = [{ device: 'u-me', linked_at: new Date(NOW).toISOString(), seen_at: new Date(NOW).toISOString(), trusted: true, this_device: true }];
  const paired = setup({ answers: { ...linked(true), online_devices: { ok: true, data: rows } } });
  await paired.account.enter();
  assert.deepEqual(await paired.account.devices(), { ok: true, rows: [{ uid: 'u-me', me: true, trusted: true, days: 0 }] });
});

test('devices: the server saying "not trusted" (demoted elsewhere) turns this device to waiting', async () => {
  const { account } = setup({ answers: { ...linked(true), online_devices: { ok: false, error: 'not trusted' } } });
  await account.enter();
  assert.deepEqual(await account.devices(), { ok: false, pending: true });
  assert.equal(account.status().trusted, false);
});

test('remove: another device by uid; this device also signs out and leaves online play', async () => {
  const { net, account, state } = setup({ answers: { ...linked(true), remove_online_device: { ok: true, data: null } } });
  await account.enter();
  assert.deepEqual(await account.remove('u-old', { me: false }), { ok: true, left: false });
  assert.deepEqual(net.calls.find((c) => c[1] === 'remove_online_device')[2], { p_uid: 'u-old' });
  assert.ok(!net.calls.some((c) => c[0] === 'signOut'));
  assert.deepEqual(await account.remove('u-me', { me: true }), { ok: true, left: true });
  assert.ok(net.calls.some((c) => c[0] === 'signOut'));
  assert.equal(state.trust, null);
  assert.equal(account.status().linked, false);
  const off = setup({ answers: { ...linked(true), remove_online_device: { ok: false, error: 'offline' } } });
  await off.account.enter();
  assert.deepEqual(await off.account.remove('u-old', { me: false }), { ok: false, errorKey: 'onlineErrOffline' });
});

test('pairCode: six digits (leading zeros kept) and when they stop working', async () => {
  const { account } = setup({ answers: { ...linked(true), online_pair_code: { ok: true, data: '042913' } } });
  await account.enter();
  assert.deepEqual(await account.pairCode(), { ok: true, code: '042913', expiresAt: NOW + PAIR_CODE_TTL_MS });
  assert.equal(PAIR_CODE_TTL_MS, 10 * 60 * 1000); // online_pair_code: 10 min
  const bad = setup({ answers: { ...linked(true), online_pair_code: { ok: true, data: 'nope' } } });
  await bad.account.enter();
  assert.deepEqual(await bad.account.pairCode(), { ok: false, errorKey: 'onlineErrGeneric' });
});

test('pair: right code pairs; wrong says the tries left; the last wrong one and a burned code say so', async () => {
  const answers = { ...linked(false), online_pair: ({ p_code }) => ({ ok: true, data: p_code === '305118' ? { ok: true, trusted: true } : p_code === '000001' ? { ok: false, error: 'wrong code', left: 0 } : p_code === '000002' ? { ok: false, error: 'no code' } : { ok: false, error: 'wrong code', left: 3 } }) };
  const { net, account, state } = setup({ answers });
  await account.enter();
  assert.deepEqual(await account.pair('12'), { ok: false, errorKey: 'onlinePairWrong', left: null }); // not six digits: no request
  assert.ok(!net.calls.some((c) => c[1] === 'online_pair'));
  assert.deepEqual(await account.pair('111 111'), { ok: false, errorKey: 'onlinePairWrong', left: 3 });
  assert.deepEqual(net.calls.find((c) => c[1] === 'online_pair')[2], { p_code: '111111' });
  assert.deepEqual(await account.pair('000001'), { ok: false, errorKey: 'onlinePairBurned' });
  assert.deepEqual(await account.pair('000002'), { ok: false, errorKey: 'onlinePairNoCode' });
  assert.deepEqual(await account.pair('305118'), { ok: true });
  assert.equal(account.status().trusted, true);
  assert.equal(state.trust, true);
});

test('leave (Clear / Load): a device never online loads nothing and calls nothing', async () => {
  const { net, account } = setup({ session: false });
  assert.deepEqual(await account.leave(), { left: false });
  assert.deepEqual(net.calls, []);
});

test('leave (Clear / Load): a device with a session unlinks, then forgets it, even offline', async () => {
  const { net, account, state } = setup({ answers: { unlink_online_player: { ok: true, data: null } }, trusted: true });
  assert.deepEqual(await account.leave(), { left: true });
  const names = net.calls.map((c) => c[1] ?? c[0]);
  assert.deepEqual(names, ['signIn', 'unlink_online_player', 'signOut']);
  assert.equal(state.trust, null);

  const off = setup({ answers: { unlink_online_player: { ok: false, error: 'offline' } } });
  off.net.signInResult = { ok: false, error: 'offline' };
  assert.deepEqual(await off.account.leave(), { left: true });
  assert.deepEqual(off.net.calls.map((c) => c[1] ?? c[0]), ['signIn', 'signOut']); // no session to unlink with: forgotten locally all the same
});

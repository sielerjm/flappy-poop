// The save panel's two states (plan 44, 44.2a; Michael's accepted design, Preview A2 and A3): signed out
// it offers Sign in and Create user, each on its own screen under ‹ Back; signed in it is the player's
// dashboard, with Sign out behind an inline confirm. A pasted code is parsed on its own and writes
// nothing until Sign in. Merge (the other half of the dashboard) is tests/savePanelMerge.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installDom } from './support/dom.js';
import { fakeStorage } from './support/scenes.js';

const body = installDom();
globalThis.localStorage = fakeStorage();
const { openSavePanel, closeSavePanel } = await import('../src/ui/savePanel.js');
const { t, profileButtonText } = await import('../src/i18n.js');
const { exportCode, SAVE_KEY } = await import('../src/save.js');

const ME = 'M'.repeat(22);
const OTHER = 'O'.repeat(22);
const GUEST = 'G'.repeat(22);
const SAVED_3_NOV = Math.floor(Date.UTC(2026, 10, 3, 12) / 1000); // noon UTC: 3 Nov in every time zone the tests run in
const tick = () => new Promise((r) => setTimeout(r, 5));
// A shown code is signed asynchronously: under a loaded full run one tick is not always enough.
const codeReady = async (id = 'save-code') => {
  for (let i = 0; i < 200 && !/^fp1\./.test(el(id).value); i++) await tick();
};
const empty = () => ({ id: null, name: '', top: [], exportedAt: null });

/** localStorage that remembers which keys were written. */
function spyStorage() {
  const s = fakeStorage();
  const set = s.setItem;
  s.writes = [];
  s.setItem = (k, v) => {
    s.writes.push(k);
    set(k, v);
  };
  return s;
}

/** Play as far as the panel reads it; `calls` records every action the panel asks of it. */
function fakePlay({ save = empty(), held = false, consent = null, cards = false, sharing = false, education = true, reachable } = {}) {
  const calls = [];
  const play = {
    calls,
    save,
    getSaveState: () => play.save,
    setSaveState: (s) => {
      calls.push(['setSaveState']);
      play.save = s;
    },
    signOut: () => {
      calls.push(['signOut']);
      play.save = empty();
    },
    onlineSessionHeld: () => held,
    onlineLeave: async () => calls.push(['onlineLeave']),
    educationAvailable: () => education,
    eduDataReachable: () => reachable ?? education,
    eduShareOn: () => sharing,
    researchConsent: () => consent,
    eduHasCards: () => cards,
    syncLeaderboard: () => calls.push(['sync']),
    forgetRename: () => calls.push(['forgetRename']),
    forgetBoardCache: () => calls.push(['forgetBoardCache']),
    noteRename: (n) => calls.push(['noteRename', n]),
    queueMerge: (keep, merge) => (calls.push(['queueMerge', keep, merge]), true),
    setHand: (h) => calls.push(['setHand', h]),
    getHand: () => null,
    checkNameAvailable: async () => true,
  };
  return play;
}

const root = () => body.find('save-panel');
const el = (id) => root().find(id);
/** In the card and not hidden, itself or any block it sits in. */
function shown(id) {
  const found = el(id);
  if (!found) return false;
  for (let e = found; e; e = e.parent) if (e.hidden) return false;
  return true;
}
const names = (calls) => calls.map((c) => c[0]);
const codeFor = (player, { hand = null } = {}) => exportCode({ exportedAt: null, ...player }, { storage: fakeStorage(), hand, now: () => SAVED_3_NOV });

async function paste(id, text) {
  const field = el(id);
  field.value = text;
  await field.fire('input');
}

function open(play, opts = {}) {
  openSavePanel({ game: {}, play, locale: 'en', ...opts });
}

test('signed out: the title, the intro and two buttons only, Sign in then Create user', async () => {
  const play = fakePlay();
  open(play);
  await tick();
  assert.equal(el('save-have-btn').textContent, t('en', 'saveSignIn'));
  assert.equal(el('save-new-btn').textContent, t('en', 'saveCreateUser'));
  assert.ok(shown('save-have-btn') && shown('save-new-btn'));
  const doors = el('save-have-btn').parent;
  assert.ok(doors.children.indexOf(el('save-have-btn')) < doors.children.indexOf(el('save-new-btn')), 'Sign in comes first');
  for (const id of ['save-name', 'save-load', 'save-code', 'save-clear-btn', 'save-merge-btn', 'save-profile-btn', 'save-help-btn', 'save-edu-btn', 'save-back']) {
    assert.equal(shown(id), false, `${id} is not on the signed-out screen`);
  }
  assert.doesNotMatch(t('en', 'saveIntro'), /\d\./, 'the four numbered steps are gone');
  closeSavePanel();
});

test("signed in: the player's dashboard (name and best, the code with Copy, Profile, Sign out, Merge, the (?) button), no doors", async () => {
  const play = fakePlay({ save: { id: ME, name: 'Mike', top: [{ score: 41, toilet: false, level: 5 }], exportedAt: null } });
  open(play);
  await tick();
  await codeReady();
  assert.equal(el('save-who').textContent, 'Mike');
  assert.ok(el('save-who-best').textContent.includes('best 41 (level 5)'), el('save-who-best').textContent);
  assert.match(el('save-code').value, /^fp1\./);
  for (const id of ['save-who', 'save-code', 'save-copy', 'save-profile-btn', 'save-clear-btn', 'save-merge-btn', 'save-help-btn', 'save-name']) assert.ok(shown(id), `${id} shown`);
  for (const id of ['save-have-btn', 'save-new-btn', 'save-load', 'save-logout', 'save-merge']) assert.equal(shown(id), false, `${id} hidden`);
  assert.equal(el('save-clear-btn').textContent, t('en', 'saveSignOut'));
  assert.equal(el('save-merge-btn').textContent, t('en', 'saveMergeOpen'));
  assert.equal(el('save-name').value, 'Mike', 'the username field is the rename');
  closeSavePanel();
});

test('Sign in and Create user each open their own screen under ‹ Back; a blur or ‹ Back creates no player', async () => {
  const storage = spyStorage();
  globalThis.localStorage = storage;
  const play = fakePlay();
  open(play);
  await el('save-have-btn').click();
  for (const id of ['save-back', 'save-load', 'save-load-btn']) assert.ok(shown(id), `${id} on the Sign in screen`);
  for (const id of ['save-have-btn', 'save-new-btn', 'save-name']) assert.equal(shown(id), false, `${id} not on the Sign in screen`);
  assert.equal(document.activeElement, el('save-load'), 'the caret in the paste field');
  await el('save-back').click();
  assert.ok(shown('save-have-btn') && shown('save-new-btn') && !shown('save-load'), '‹ Back: the two buttons again');
  await el('save-new-btn').click();
  for (const id of ['save-back', 'save-name', 'save-save-btn']) assert.ok(shown(id), `${id} on the Create user screen`);
  assert.equal(el('save-save-btn').textContent, t('en', 'saveCreateUser'));
  assert.equal(shown('save-load'), false);
  el('save-name').value = 'Newbie';
  await el('save-name').fire('blur');
  await el('save-name').fire('change');
  await tick();
  await el('save-back').click();
  await tick();
  assert.equal(play.save.name, '', 'no player made');
  assert.deepEqual(names(play.calls).filter((n) => n !== 'sync'), [], 'nothing asked of Play');
  assert.ok(!storage.writes.includes(SAVE_KEY), 'nothing stored');
  closeSavePanel();
});

test('focusName (the Create user buttons) opens Create user with the caret in the field; without it, the two buttons', async () => {
  globalThis.localStorage = fakeStorage();
  open(fakePlay(), { focusName: true });
  assert.ok(shown('save-name') && !shown('save-have-btn'));
  assert.equal(document.activeElement, el('save-name'));
  closeSavePanel();
  open(fakePlay());
  assert.ok(shown('save-have-btn') && shown('save-new-btn') && !shown('save-name'), 'the home button: Sign in | Create user');
  closeSavePanel();
});

test("a pasted code writes nothing until Sign in; on an empty device Sign in is one tap and takes the code's player", async () => {
  const storage = spyStorage();
  globalThis.localStorage = storage;
  const play = fakePlay();
  const before = play.save;
  const code = await codeFor({ id: OTHER, name: 'Mike', top: [{ score: 41, toilet: false, level: 5 }] }, { hand: 'left' });
  open(play);
  await el('save-have-btn').click();
  assert.equal(el('save-load-btn').disabled, true, 'nothing to sign in with yet');
  await paste('save-load', code);
  assert.ok(!storage.writes.includes(SAVE_KEY), 'the parse stores nothing');
  assert.equal(play.save, before, 'and sets nothing');
  assert.deepEqual(play.calls, []);
  assert.ok(shown('save-login-card'));
  const card = el('save-login-card');
  assert.equal(card.children[0].textContent, 'Mike');
  assert.equal(card.children[1].textContent, 'best 41 (level 5) · saved 3 Nov');
  assert.equal(shown('save-guest-line'), false, 'an empty device: no guest line');
  assert.equal(el('save-load-btn').disabled, false);
  await el('save-load-btn').click();
  await tick();
  assert.deepEqual([play.save.id, play.save.name, play.save.top.map((e) => e.score)], [OTHER, 'Mike', [41]]);
  assert.ok(storage.writes.includes(SAVE_KEY), 'Sign in stores the player');
  assert.ok(names(play.calls).includes('forgetRename'), "the code's name is not a rename");
  assert.deepEqual(play.calls.find((c) => c[0] === 'setHand'), ['setHand', 'left'], "the code's bean side");
  assert.ok(!names(play.calls).includes('queueMerge'), 'no player here before: nothing to merge');
  assert.ok(!names(play.calls).includes('onlineLeave'));
  assert.equal(el('save-status').className, 'status ok');
  assert.ok(el('save-status').textContent.includes('Mike'), el('save-status').textContent);
  assert.ok(shown('save-who') && shown('save-code') && !shown('save-have-btn'), 'the panel is the dashboard now');
  closeSavePanel();
});

test("on a guest device the line says what joins, and the guest's scores join the code's player under its id", async () => {
  globalThis.localStorage = fakeStorage();
  const code = await codeFor({ id: OTHER, name: 'Mike', top: [{ score: 41, toilet: false, level: 5 }] });
  const play = fakePlay({ save: { id: GUEST, name: '', top: [{ score: 7, toilet: false, level: 2 }, { score: 3, toilet: false, level: 1 }], exportedAt: null } });
  open(play);
  await el('save-have-btn').click();
  await paste('save-load', code);
  assert.ok(shown('save-guest-line'));
  assert.equal(el('save-guest-line').textContent, t('en', 'saveGuestJoin').replace('{n}', '2').replace('{name}', 'Mike'));
  assert.deepEqual(play.calls, [], 'still nothing written');
  await el('save-load-btn').click();
  await tick();
  assert.deepEqual([play.save.id, play.save.name, play.save.top.map((e) => e.score)], [OTHER, 'Mike', [41, 7, 3]]);
  assert.deepEqual(play.calls.find((c) => c[0] === 'queueMerge'), ['queueMerge', OTHER, GUEST], "the guest's id folds into the code's");
  closeSavePanel();
  // One score, and a pilot tester with none: their own wording.
  const one = fakePlay({ save: { id: GUEST, name: '', top: [{ score: 7, toilet: false, level: 2 }], exportedAt: null } });
  open(one);
  await el('save-have-btn').click();
  await paste('save-load', code);
  assert.equal(el('save-guest-line').textContent, t('en', 'saveGuestJoinOne').replace('{name}', 'Mike'));
  closeSavePanel();
  const tester = fakePlay({ save: { id: GUEST, name: '', top: [], exportedAt: null }, consent: { id: GUEST } });
  open(tester);
  await el('save-have-btn').click();
  await paste('save-load', code);
  assert.equal(el('save-guest-line').textContent, t('en', 'saveGuestJoinOther').replace('{name}', 'Mike'));
  closeSavePanel();
});

test('a foreign or damaged code says why, shows no card, and Sign in stays off', async () => {
  globalThis.localStorage = fakeStorage();
  const play = fakePlay();
  const code = await codeFor({ id: OTHER, name: 'Mike', top: [] });
  const [prefix, payload, sig] = code.split('.');
  const damaged = [prefix, (payload[0] === 'A' ? 'B' : 'A') + payload.slice(1), sig].join('.');
  open(play);
  await el('save-have-btn').click();
  await paste('save-load', 'hello there');
  assert.deepEqual([el('save-status').textContent, el('save-status').className], [t('en', 'saveErrorUnrecognised'), 'status error']);
  assert.ok(!shown('save-login-card') && el('save-load-btn').disabled);
  await paste('save-load', damaged);
  assert.equal(el('save-status').textContent, t('en', 'saveErrorDamaged'));
  assert.ok(!shown('save-login-card') && el('save-load-btn').disabled);
  await el('save-load-btn').click();
  assert.deepEqual(play.calls, []);
  closeSavePanel();
});

test("Sign out opens a confirm with the code, its own Copy and Clear's notes; Cancel changes nothing", async () => {
  globalThis.localStorage = fakeStorage();
  const play = fakePlay({ save: { id: ME, name: 'Mike', top: [], exportedAt: null }, held: true, cards: true, sharing: true });
  const before = play.save;
  open(play);
  await tick();
  await codeReady();
  const dashboardCode = el('save-code').value;
  await el('save-clear-btn').click();
  await tick();
  assert.deepEqual(play.calls, [], 'the first tap only asks');
  assert.ok(shown('save-logout'));
  assert.equal(el('save-logout-code').value, dashboardCode, "the dashboard's code, in the confirm");
  assert.match(el('save-logout-code').value, /^fp1\./);
  assert.ok(shown('save-logout-copy') && !el('save-logout-copy').disabled);
  const notes = el('save-logout-notes').textContent;
  for (const key of ['saveClearNoteCards', 'saveClearNoteShared', 'saveClearNoteOnline']) assert.ok(notes.includes(t('en', key)), `${key} in "${notes}"`);
  assert.ok(!notes.includes(t('en', 'saveClearNotePilot')), 'no consent here: no pilot note');
  assert.equal(document.activeElement, el('save-logout-cancel'), 'the focus on Cancel');
  assert.ok(shown('save-who') && shown('save-clear-btn'), 'the name line and the account row stay');
  for (const id of ['save-code', 'save-profile-btn', 'save-name']) assert.equal(shown(id), false, `${id} steps aside while the confirm is open`);
  await el('save-logout-cancel').click();
  await tick();
  assert.equal(shown('save-logout'), false);
  assert.ok(shown('save-code'), 'the dashboard is back');
  assert.deepEqual(play.calls, [], 'Cancel: no sign-out, no online leave');
  assert.equal(play.save, before);
  closeSavePanel();
});

test('Sign out in the confirm forgets what signOut forgets, leaves online play when a session is held, and turns the panel to the two buttons', async () => {
  globalThis.localStorage = fakeStorage();
  for (const held of [true, false]) {
    const play = fakePlay({ save: { id: ME, name: 'Mike', top: [], exportedAt: null }, held });
    open(play);
    await tick();
    await el('save-clear-btn').click();
    await el('save-logout-confirm').click();
    await tick();
    assert.deepEqual(names(play.calls).sort(), held ? ['onlineLeave', 'signOut'] : ['signOut'], `held ${held}`);
    assert.deepEqual([el('save-status').textContent, el('save-status').className], [t('en', 'saveCleared'), 'status ok']);
    assert.ok(shown('save-have-btn') && shown('save-new-btn') && !shown('save-clear-btn') && !shown('save-who'), 'signed out now');
    closeSavePanel();
  }
});

test("Create user stores the name and opens the popup on the user code; Got it opens the dashboard", async () => {
  globalThis.localStorage = fakeStorage();
  const play = fakePlay();
  open(play);
  await el('save-new-btn').click();
  el('save-name').value = 'Newbie';
  await el('save-save-btn').click();
  await tick();
  await codeReady('save-explain-code');
  assert.equal(play.save.name, 'Newbie');
  assert.ok(play.calls.some((c) => c[0] === 'noteRename' && c[1] === 'Newbie'));
  assert.ok(shown('save-explain'), 'the popup about the user code');
  assert.match(el('save-explain-code').value, /^fp1\./);
  assert.equal(el('save-status').textContent, '', 'no status line under the popup');
  assert.equal(shown('save-help-btn'), false);
  await el('save-explain-ok').click();
  assert.equal(shown('save-explain'), false);
  assert.ok(shown('save-who') && shown('save-code') && shown('save-clear-btn'), 'the dashboard');
  closeSavePanel();
});

// Michael's playtest (24 Nov, after 44.5): the help card reflowed the centred card, so the (?) moved and a
// second tap where it had been could land on the backdrop and close the panel; from Sign out it also dropped
// the confirm. Now the help is a layer over the card: what is under it stays exactly as it was.
test('the (?) opens "What\'s on this page" as a layer over the dashboard, which stays as it is under it; (?) again or Got it closes it', async () => {
  globalThis.localStorage = fakeStorage();
  open(fakePlay({ save: { id: ME, name: 'Mike', top: [], exportedAt: null } }));
  await tick();
  const card = el('save-help-btn').parent;
  const before = card.children.map((c) => c.id || c.className);
  await el('save-help-btn').click();
  assert.ok(shown('save-help') && shown('save-help-ok'));
  assert.ok(el('save-help').classList.contains('over'), 'a layer over the card');
  assert.equal(card.children.at(-1), el('save-help'), 'last in the card, over everything else');
  assert.deepEqual(card.children.filter((c) => c !== el('save-help')).map((c) => c.id || c.className), before, 'nothing else in the card moved');
  for (const id of ['save-who', 'save-code', 'save-clear-btn', 'save-merge-btn', 'save-profile-btn']) assert.ok(shown(id), `${id} still in place under the layer`);
  assert.equal(document.activeElement, el('save-help-ok'));
  await el('save-help-btn').click();
  assert.equal(shown('save-help'), false, '(?) again closes it');
  assert.equal(document.activeElement, el('save-help-btn'));
  await el('save-help-btn').click();
  await el('save-help-ok').click();
  assert.ok(!shown('save-help') && shown('save-code') && shown('save-help-btn'), 'Got it closes it too');
  closeSavePanel();
});

test('the (?) over the Sign out confirm keeps the confirm: closing the help goes back to it, nothing signed out', async () => {
  globalThis.localStorage = fakeStorage();
  const play = fakePlay({ save: { id: ME, name: 'Mike', top: [], exportedAt: null } });
  open(play);
  await tick();
  await el('save-clear-btn').click();
  assert.ok(shown('save-logout'));
  await el('save-help-btn').click();
  assert.ok(shown('save-help'));
  assert.ok(shown('save-logout'), 'the confirm waits under the layer');
  await el('save-help-ok').click();
  assert.ok(!shown('save-help') && shown('save-logout') && shown('save-logout-confirm'), 'back on the Sign out confirm');
  await el('save-help-btn').click();
  await el('save-help-btn').click();
  assert.ok(shown('save-logout'), '(?) twice: still on the confirm');
  assert.deepEqual(play.calls, [], 'nothing signed out');
  closeSavePanel();
});

test('Escape with the help open closes the help, not the panel; a second Escape closes the panel', async () => {
  globalThis.localStorage = fakeStorage();
  open(fakePlay({ save: { id: ME, name: 'Mike', top: [], exportedAt: null } }));
  await el('save-help-btn').click();
  await root().fire('keydown', { key: 'Escape' });
  assert.ok(root().hidden === false && !shown('save-help') && shown('save-code'), 'the help closes, the dashboard stays');
  await root().fire('keydown', { key: 'Escape' });
  assert.equal(root().hidden, true);
});

// Michael's playtest (24 Nov): ✕ should go back to the page before, as Got it, ‹ Back and Cancel do; only
// from the top (the dashboard, or Sign in | Create user) does it close. Escape is the same key.
test('✕ steps back one level: the help, the popup after Create user, a confirm, a Sign in or Create user screen; from the top it closes', async () => {
  globalThis.localStorage = fakeStorage();
  const x = () => el('save-close').click();
  const signedIn = fakePlay({ save: { id: ME, name: 'Mike', top: [], exportedAt: null } });
  open(signedIn);
  await tick();
  await el('save-help-btn').click();
  await x();
  assert.ok(root().hidden === false && !shown('save-help') && shown('save-code'), 'the help: back to the dashboard');
  await el('save-clear-btn').click();
  await el('save-help-btn').click();
  await x();
  assert.ok(shown('save-logout'), 'the help over Sign out: back to the confirm');
  await x();
  assert.ok(root().hidden === false && !shown('save-logout') && shown('save-code'), 'the Sign out confirm: back to the dashboard');
  await el('save-merge-btn').click();
  await x();
  assert.ok(root().hidden === false && !shown('save-merge') && shown('save-code'), 'Merge: back to the dashboard');
  assert.deepEqual(signedIn.calls, [], 'nothing signed out or merged');
  await x();
  assert.equal(root().hidden, true, 'the dashboard: ✕ closes');

  const fresh = fakePlay();
  open(fresh);
  await el('save-have-btn').click();
  await x();
  assert.ok(root().hidden === false && shown('save-have-btn') && shown('save-new-btn'), 'Sign in: back to the two buttons');
  await el('save-new-btn').click();
  await root().fire('keydown', { key: 'Escape' });
  assert.ok(root().hidden === false && shown('save-have-btn'), 'Create user: Escape goes back too');
  await x();
  assert.equal(root().hidden, true, 'the two buttons: ✕ closes');

  open(fakePlay(), { focusName: true });
  await x();
  assert.equal(root().hidden, true, 'Create user opened by a Create user button elsewhere: ✕ goes back there (closes)');

  const creating = fakePlay();
  open(creating);
  await el('save-new-btn').click();
  el('save-name').value = 'Newbie';
  await el('save-save-btn').click();
  await tick();
  assert.ok(shown('save-explain'));
  await x();
  assert.ok(root().hidden === false && !shown('save-explain') && shown('save-code'), 'the popup after Create user: back to the dashboard');
  closeSavePanel();
});

test('📚 Education data shows signed out only when education is off for everyone and this device still needs it (AUD-037)', () => {
  globalThis.localStorage = fakeStorage();
  open(fakePlay({ education: true }));
  assert.equal(shown('save-edu-btn'), false, 'education on: 📚 waits for a player');
  closeSavePanel();
  open(fakePlay({ education: false, reachable: true }));
  assert.ok(shown('save-edu-btn'), 'off for everyone, a consent or a share held: Withdraw and Stop sharing stay reachable');
  closeSavePanel();
  open(fakePlay({ education: false, reachable: false }));
  assert.equal(shown('save-edu-btn'), false);
  closeSavePanel();
});

test('the username and code fields are not credentials to password managers', async () => {
  globalThis.localStorage = fakeStorage();
  open(fakePlay());
  await el('save-new-btn').click();
  const fields = [el('save-name')];
  await el('save-back').click();
  await el('save-have-btn').click();
  fields.push(el('save-load'));
  for (const f of fields) {
    assert.deepEqual([f.id, f.getAttribute('type'), f.getAttribute('autocomplete'), f.getAttribute('data-1p-ignore'), f.getAttribute('data-lpignore'), f.getAttribute('data-bwignore')], [f.id, 'search', 'off', 'true', 'true', 'true']);
  }
  closeSavePanel();
});

test('the home button says Sign in with no username, in both locales', () => {
  assert.equal(profileButtonText('en', { name: '', top: [] }), 'Sign in');
  assert.equal(profileButtonText('zh-Hans', { name: '', top: [] }), '登录');
});

test('no string still names the old Load user button', () => {
  const stale = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8').split('\n').filter((l) => /Load user|load your user code|载入用户/.test(l));
  assert.deepEqual(stale.map((l) => l.trim().slice(0, 60)), []);
});

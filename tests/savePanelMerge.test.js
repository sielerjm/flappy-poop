// Merge players… (plan 44, 44.2b): two players become one only through the dashboard's Merge, after
// both are shown side by side and the player picks whose name stays (this device's by default). The
// pick decides the order handed to merge_players(keep, merge); the PGlite test at the end checks the
// server's fold keeps the device's name either way it can happen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './support/dom.js';
import { fakeStorage, playScene } from './support/scenes.js';
import { freshDb, asAnon } from './support/postgrest.js';

const body = installDom();
globalThis.localStorage = fakeStorage();
const { openSavePanel, closeSavePanel } = await import('../src/ui/savePanel.js');
const { t } = await import('../src/i18n.js');
const { exportCode, SAVE_KEY } = await import('../src/save.js');

const ME = 'M'.repeat(22);
const OTHER = 'O'.repeat(22);
const THIRD = 'T'.repeat(22);
const tick = () => new Promise((r) => setTimeout(r, 5));

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

function fakePlay({ held = false } = {}) {
  const calls = [];
  const play = {
    calls,
    save: { id: ME, name: 'Mike', top: [{ score: 50, toilet: false, level: 6 }], exportedAt: null },
    getSaveState: () => play.save,
    setSaveState: (s) => {
      calls.push(['setSaveState']);
      play.save = s;
    },
    signOut: () => calls.push(['signOut']),
    onlineSessionHeld: () => held,
    onlineLeave: async () => calls.push(['onlineLeave']),
    educationAvailable: () => true,
    eduShareOn: () => false,
    researchConsent: () => null,
    eduHasCards: () => false,
    syncLeaderboard: () => calls.push(['sync']),
    forgetRename: () => calls.push(['forgetRename']),
    forgetBoardCache: () => calls.push(['forgetBoardCache']),
    noteRename: (n) => calls.push(['noteRename', n]),
    queueMerge: (keep, merge) => (calls.push(['queueMerge', keep, merge]), true),
    setHand: (h) => calls.push(['setHand', h]),
    getHand: () => null,
    checkNameAvailable: async () => true,
    openStats: (target, opts) => calls.push(['openStats', target, opts]),
    openEduData: (opts) => calls.push(['openEduData', opts]),
    openSavePanel: () => calls.push(['openSavePanel']),
  };
  return play;
}

const root = () => body.find('save-panel');
const el = (id) => root().find(id);
function shown(id) {
  const found = el(id);
  if (!found) return false;
  for (let e = found; e; e = e.parent) if (e.hidden) return false;
  return true;
}
const names = (calls) => calls.map((c) => c[0]);
/** The calls that change something (a sync is harmless; the checks below are about writes). */
const writes = (calls) => calls.filter((c) => c[0] !== 'sync');
const codeFor = (player, { hand = 'left' } = {}) => exportCode({ exportedAt: null, ...player }, { storage: fakeStorage(), hand, now: () => 1_790_000_000 });
const mike2 = () => codeFor({ id: OTHER, name: 'Mike2', top: [{ score: 10, toilet: false, level: 2 }] });

async function paste(text) {
  el('save-merge-input').value = text;
  await el('save-merge-input').fire('input');
}

async function openMerge(play) {
  openSavePanel({ game: {}, play, locale: 'en' });
  await tick();
  await el('save-merge-btn').click();
}

test('Merge opens a paste; once a code parses, both cards show, this device marked as the one that stays, and nothing is written', async () => {
  const storage = spyStorage();
  globalThis.localStorage = storage;
  const play = fakePlay();
  const before = play.save;
  await openMerge(play);
  assert.ok(shown('save-merge') && shown('save-merge-input'));
  assert.equal(document.activeElement, el('save-merge-input'));
  assert.equal(el('save-merge-confirm').disabled, true, 'nothing to merge yet');
  assert.equal(shown('save-card-device'), false);
  assert.equal(shown('save-code'), false, 'the dashboard steps aside');
  const f = el('save-merge-input');
  assert.deepEqual([f.getAttribute('type'), f.getAttribute('autocomplete'), f.getAttribute('data-1p-ignore')], ['search', 'off', 'true'], 'not a credential field');
  storage.writes.length = 0;
  await paste(await mike2());
  assert.ok(shown('save-card-device') && shown('save-card-code'));
  const [dLabel, dName, dLine, dStays] = el('save-card-device').children;
  const [cLabel, cName, cLine, cStays] = el('save-card-code').children;
  assert.deepEqual([dLabel.textContent, dName.textContent, cLabel.textContent, cName.textContent], [t('en', 'saveCardDevice'), 'Mike', t('en', 'saveCardCode'), 'Mike2']);
  assert.ok(dLine.textContent.startsWith('best 50 (level 6)'), dLine.textContent);
  assert.ok(cLine.textContent.startsWith('best 10 (level 2)'), `the code's own best, though this device's is higher: ${cLine.textContent}`);
  assert.deepEqual([dStays.textContent, cStays.textContent], [t('en', 'saveCardStays'), '']);
  assert.ok(el('save-card-device').classList.contains('kept') && !el('save-card-code').classList.contains('kept'));
  assert.equal(el('save-merge-confirm').disabled, false);
  assert.equal(el('save-merge-confirm').textContent, t('en', 'saveMergeConfirm'));
  assert.deepEqual(writes(play.calls), [], 'a paste merges nothing');
  assert.ok(!storage.writes.includes(SAVE_KEY));
  assert.equal(play.save, before);
  closeSavePanel();
});

test("Merge for good with this device kept: its id and name stay, the scores join, the code's id folds into it, and the name goes to the board as a rename", async () => {
  globalThis.localStorage = fakeStorage();
  const play = fakePlay();
  await openMerge(play);
  await paste(await mike2());
  await el('save-merge-confirm').click();
  await tick();
  assert.deepEqual([play.save.id, play.save.name, play.save.top.map((e) => e.score)], [ME, 'Mike', [50, 10]]);
  assert.deepEqual(play.calls.filter((c) => c[0] === 'queueMerge'), [['queueMerge', ME, OTHER]]);
  assert.ok(play.calls.some((c) => c[0] === 'noteRename' && c[1] === 'Mike'), 'the next post carries this name, row or no row');
  assert.ok(names(play.calls).includes('forgetBoardCache'), "the folded player's bests, totals and days come with the sync");
  assert.ok(!names(play.calls).includes('forgetRename'));
  assert.ok(!names(play.calls).includes('setHand'), "the code's bean side is not applied");
  assert.equal(el('save-status').textContent, t('en', 'saveMergedInto').replace('{other}', 'Mike2').replace('{name}', 'Mike'));
  assert.ok(!shown('save-merge') && shown('save-code'), 'back to the dashboard');
  closeSavePanel();
});

test("a tap on the code's card keeps the code: exactly what a Load did", async () => {
  globalThis.localStorage = fakeStorage();
  const play = fakePlay();
  await openMerge(play);
  await paste(await mike2());
  await el('save-card-code').click();
  assert.ok(el('save-card-code').classList.contains('kept') && !el('save-card-device').classList.contains('kept'));
  assert.equal(el('save-card-code').children[3].textContent, t('en', 'saveCardStays'));
  assert.deepEqual(writes(play.calls), [], 'the pick writes nothing');
  await el('save-merge-confirm').click();
  await tick();
  assert.deepEqual([play.save.id, play.save.name, play.save.top.map((e) => e.score)], [OTHER, 'Mike2', [50, 10]]);
  assert.deepEqual(play.calls.filter((c) => c[0] === 'queueMerge'), [['queueMerge', OTHER, ME]]);
  assert.ok(names(play.calls).includes('forgetRename'));
  assert.ok(!names(play.calls).includes('noteRename'));
  assert.deepEqual(play.calls.find((c) => c[0] === 'setHand'), ['setHand', 'left']);
  assert.equal(el('save-status').textContent, t('en', 'saveMergedInto').replace('{other}', 'Mike').replace('{name}', 'Mike2'));
  closeSavePanel();
});

test('Cancel, an edit, a second paste and closing write nothing (save, merge queue, rename, online session)', async () => {
  const storage = spyStorage();
  globalThis.localStorage = storage;
  const play = fakePlay({ held: true });
  const before = play.save;
  await openMerge(play);
  storage.writes.length = 0;
  await paste(await mike2());
  await el('save-card-code').click();
  await el('save-merge-cancel').click();
  assert.equal(shown('save-merge'), false, 'Cancel closes the merge');
  await el('save-merge-btn').click();
  assert.equal(el('save-merge-input').value, '', 'and drops the paste');
  await paste(await mike2());
  await paste('not a code');
  assert.ok(!shown('save-card-device') && el('save-merge-confirm').disabled, 'an edit clears the pending result');
  await el('save-merge-confirm').click();
  await paste(await mike2());
  await el('save-card-code').click();
  await paste(await codeFor({ id: THIRD, name: 'Mike3', top: [] }));
  assert.equal(el('save-card-code').children[1].textContent, 'Mike3', 'a second paste replaces the first');
  assert.ok(el('save-card-device').classList.contains('kept'), 'and the pick starts over on this device');
  closeSavePanel();
  assert.deepEqual(writes(play.calls), [], 'no write, no queued merge, no rename, no online leave');
  assert.ok(!storage.writes.includes(SAVE_KEY));
  assert.equal(play.save, before);
});

test("this player's own code says That's already you. and merges nothing", async () => {
  globalThis.localStorage = fakeStorage();
  const play = fakePlay();
  await openMerge(play);
  await paste(await codeFor({ id: ME, name: 'Mike', top: [{ score: 9, toilet: false, level: 1 }] }));
  assert.equal(el('save-status').textContent, t('en', 'saveSamePlayer'));
  assert.ok(!shown('save-card-device') && el('save-merge-confirm').disabled);
  await el('save-merge-confirm').click();
  await tick();
  assert.deepEqual(writes(play.calls), []);
  closeSavePanel();
});

test('a damaged code in Merge shows the error and no cards', async () => {
  globalThis.localStorage = fakeStorage();
  const play = fakePlay();
  const [prefix, payload, sig] = (await mike2()).split('.');
  await openMerge(play);
  await paste([prefix, (payload[0] === 'A' ? 'B' : 'A') + payload.slice(1), sig].join('.'));
  assert.deepEqual([el('save-status').textContent, el('save-status').className], [t('en', 'saveErrorDamaged'), 'status error']);
  assert.ok(!shown('save-card-device') && el('save-merge-confirm').disabled);
  closeSavePanel();
});

test('online: with a session held the confirm says pairing may be asked again; this device kept leaves nothing, the code kept leaves online play', async () => {
  globalThis.localStorage = fakeStorage();
  const kept = fakePlay({ held: true });
  await openMerge(kept);
  await paste(await mike2());
  assert.ok(shown('save-merge-online'));
  assert.equal(el('save-merge-online').textContent, t('en', 'saveMergeOnline'));
  await el('save-merge-confirm').click();
  await tick();
  assert.ok(!names(kept.calls).includes('onlineLeave'), 'the id did not change: the session stays');
  closeSavePanel();
  const swapped = fakePlay({ held: true });
  await openMerge(swapped);
  await paste(await mike2());
  await el('save-card-code').click();
  await el('save-merge-confirm').click();
  await tick();
  assert.ok(names(swapped.calls).includes('onlineLeave'), "another player's id here: this device leaves online play");
  assert.ok(el('save-status').textContent.endsWith(t('en', 'saveLoadedNoteOnline')));
  closeSavePanel();
  const never = fakePlay({ held: false });
  await openMerge(never);
  await paste(await mike2());
  assert.equal(shown('save-merge-online'), false, 'no session: no line');
  closeSavePanel();
});

test('Profile and 📚 from the dashboard come back to it when they close', async () => {
  globalThis.localStorage = fakeStorage();
  const play = fakePlay();
  openSavePanel({ game: {}, play, locale: 'en' });
  await el('save-profile-btn').click();
  const [, target, opts] = play.calls.find((c) => c[0] === 'openStats');
  assert.equal(target, null, "this device's own profile");
  opts.onClose();
  assert.ok(names(play.calls).includes('openSavePanel'));
  play.calls.length = 0;
  openSavePanel({ game: {}, play, locale: 'en' });
  await el('save-edu-btn').click();
  play.calls.find((c) => c[0] === 'openEduData')[1].onClose();
  assert.ok(names(play.calls).includes('openSavePanel'));
  closeSavePanel();
});

test('Play.forgetBoardCache drops the board bests, the career base and the streak days, and keeps the rename; forgetRename does both', () => {
  const make = () => {
    const seen = [];
    const p = playScene({
      boardBestsFor: ME,
      renameStore: { clear: () => seen.push('rename') },
      careerStore: { clearBase: () => seen.push('career') },
      streakStore: { clear: () => seen.push('streak') },
      registry: { remove: (k) => seen.push(`registry:${k}`) },
      refreshStreakMarks: () => seen.push('marks'),
    });
    return { p, seen };
  };
  const a = make();
  a.p.forgetBoardCache();
  assert.equal(a.p.boardBestsFor, null);
  assert.deepEqual(a.seen.sort(), ['career', 'marks', 'registry:playDaysFor', 'streak']);
  const b = make();
  b.p.forgetRename();
  assert.equal(b.p.boardBestsFor, null);
  assert.deepEqual(b.seen.sort(), ['career', 'marks', 'registry:playDaysFor', 'rename', 'streak']);
});

test('Play.openStats takes an onClose for the profile (the save panel opens again when it closes)', () => {
  const chrome = [];
  const p = playScene({ handleChrome: (k) => chrome.push(k) });
  const back = () => {};
  p.openStats(null, { onClose: back });
  assert.deepEqual([p.statsTarget, p.statsOnClose, chrome], [null, back, ['stats']]);
  p.openStats({ name: 'Someone' });
  assert.equal(p.statsOnClose, null, 'a profile opened any other way has none');
});

// The server's side (db/schema.sql fold_player): merge_players(keep, merge) already takes either order;
// the kept side's newest score row names the player. With this device kept and no row of its own yet, the
// fold takes the code's name, and the rename the panel queued (noteRename) puts the device's back on
// the next post.
test("merge_players with this device's id kept: one player under the device id with the code's scores; with no row of its own, the next post carries the device's name", async () => {
  const db = await freshDb();
  const row = (pid, name, score, ago = '1 hour') => db.query(`insert into public.scores (player_id, name, score, toilet, level, updated_at) values ($1, $2, $3, false, 3, now() - interval '${ago}')`, [pid, name, score]);
  const rows = async () => (await db.query('select player_id, name, score from public.scores order by player_id, score')).rows.map((r) => [r.player_id, r.name, r.score]);
  // A board row on each side: the device's name stays, the higher score is kept.
  await row(ME, 'Mike', 20);
  await row(OTHER, 'Mike2', 35);
  await asAnon(db, 'select public.merge_players($1, $2)', [ME, OTHER]);
  assert.deepEqual(await rows(), [[ME, 'Mike', 35]]);
  // No row under the device's id: the fold names it after the code's player...
  await db.query('delete from public.scores');
  const CODE2 = 'C'.repeat(22); // OTHER is ME's alias now: a fresh pair
  await row(CODE2, 'Mike2', 35);
  await asAnon(db, 'select public.merge_players($1, $2)', [THIRD, CODE2]);
  assert.deepEqual(await rows(), [[THIRD, 'Mike2', 35]]);
  // ...and the post that carries the rename (a lower score: it raises nothing, so no run is needed) names it back.
  await asAnon(db, 'select public.submit_score($1, $2, $3, false, 1)', [THIRD, 'Mike', 4]);
  assert.deepEqual(await rows(), [[THIRD, 'Mike', 35]]);
});

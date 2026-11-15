// The 💾 part of 📚 Education data (plan 28, 3.1b) in a fake DOM: back up through the share sheet
// (reached inside the tap), a download, copy as text, restore from a file or pasted text, restore only
// from the home screen; Play's backup and restore; Clear's note about the cards.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './support/dom.js';
import { playScene, fakeStorage } from './support/scenes.js';

const body = installDom();
const { openEduDataPanel, closeEduDataPanel } = await import('../src/ui/eduDataPanel.js');
const { openSavePanel, closeSavePanel } = await import('../src/ui/savePanel.js');
const { t } = await import('../src/i18n.js');
const { createEduStore, createEduShareStore } = await Promise.all([import('../src/education.js'), import('../src/leaderboard.js')]).then(([e, l]) => ({ ...e, ...l }));
const { createSettingsStore } = await import('../src/logic.js');
const { educationBackup, readEducationBackup } = await import('../src/education.js');

const DAY = 86400000;
const T0 = Date.UTC(2026, 10, 1, 12);
const card = (lastAt) => ({ state: 'review', stability: 3, difficulty: 5, dueAt: lastAt + 3 * DAY, reviewedAt: lastAt, lastAt, reps: 2, lapses: 0, seen: 2, right: 2, firstAt: T0 });
const RECORD = { v: 2, cards: { 'ST-01': card(T0), 'ST-02': card(T0 + DAY) }, recent: [], counters: { gradedRuns: 4, gradeSum: 30000 }, badges: { edu_grade_a: '2026-11-02' }, unlockedLevel: 2 };
const BACKUP_TEXT = JSON.stringify(educationBackup(RECORD, { eduNewOrder: 'mixed', eduStartLevel: 2 }, T0));
const el = (id) => body.find(id);

/** The browser's navigator and matchMedia, replaced for one test. */
function setNav(nav, { coarse = true } = {}) {
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  globalThis.matchMedia = (q) => ({ matches: q === '(pointer: coarse)' ? coarse : false });
}
/** A share sheet that records each call; it answers `answer` (a promise maker). */
function sheet({ can = true, answer = () => Promise.resolve() } = {}) {
  const calls = [];
  return { calls, canShare: () => can, share: (data) => (calls.push(data), answer()) };
}
/** Downloads: every <a> the page makes and clicks. */
function watchDownloads() {
  const clicks = [];
  const make = document.createElement;
  document.createElement = (tag) => {
    const e = make(tag);
    if (tag === 'a') e.click = () => clicks.push({ href: e.href, download: e.download });
    return e;
  };
  return { clicks, stop: () => (document.createElement = make) };
}

/** A device for the panel: what it reads of Play, with the 💾 part's methods as given. */
function device(over = {}) {
  const restored = [];
  return {
    restored,
    save: { id: 'B'.repeat(22), name: 'Backer' },
    eduShareOn: () => false,
    researchJoined: () => false,
    researchConsent: () => null,
    eduInvited: () => false,
    eduHasCards: () => true,
    eduCardCount: () => 2,
    eduBackupText: () => BACKUP_TEXT,
    canRestoreEducation: () => true,
    restoreEducation: (text) => (restored.push(text), text === BACKUP_TEXT ? { ok: true, added: 2, updated: 0, badges: 1, changed: true, saved: true, skipped: 0 } : readEducationBackup(text)),
    ...over,
  };
}
const open = (play, locale = 'en') => openEduDataPanel({ game: null, play, locale });
const tick = () => new Promise((r) => setTimeout(r, 5));

afterEach(() => {
  closeEduDataPanel();
  delete globalThis.matchMedia;
});

test('the 💾 part shows for a player not invited, with the card count; with no cards it says so and nothing can be backed up', () => {
  open(device());
  assert.equal(el('edu-backup-title').hidden, false);
  assert.equal(el('edu-backup-title').textContent, t('en', 'eduBackupTitle'));
  assert.equal(el('edu-backup-save').hidden, false, 'not gated by the invitation');
  assert.equal(el('edu-backup-state').textContent, t('en', 'eduBackupCount').replace('{n}', '2'));
  assert.equal(el('edu-backup-save').disabled, false);
  assert.equal(el('edu-invite-note').hidden, false, 'the invitation note still shows');
  closeEduDataPanel();
  open(device({ eduHasCards: () => false, eduCardCount: () => 0, eduBackupText: () => null }));
  assert.equal(el('edu-backup-state').textContent, t('en', 'eduBackupNone'));
  assert.deepEqual([el('edu-backup-save').disabled, el('edu-backup-copy').disabled], [true, true]);
});

test('Back up reaches the share sheet inside the tap, before any await, with a JSON file and no text; a second tap while the sheet is open does nothing', async () => {
  let finish;
  const nav = sheet({ answer: () => new Promise((r) => (finish = r)) });
  setNav(nav);
  open(device());
  el('edu-backup-save').listeners.click[0]({}); // the tap itself, not awaited
  assert.equal(nav.calls.length, 1, 'share() ran inside the tap');
  const data = nav.calls[0];
  assert.deepEqual(Object.keys(data), ['files'], 'the file alone (text beside it can hide Save to Files on iOS)');
  const file = data.files[0];
  assert.match(file.name, /^flappy-poop-cards-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(file.type, 'application/json');
  assert.equal(JSON.parse(await file.text()).kind, 'flappy-poop-education');
  await el('edu-backup-save').click();
  assert.equal(nav.calls.length, 1, 'a second tap while the sheet is open does nothing');
  assert.equal(el('edu-backup-save').disabled, true);
  finish();
  await tick();
  assert.equal(el('edu-backup-status').textContent, t('en', 'eduBackupShared'));
  assert.equal(el('edu-backup-save').disabled, false);
});

test('a closed share sheet is "Not backed up" and no download; no share sheet for files, or a mouse, gives a download', async () => {
  const dl = watchDownloads();
  try {
    setNav(sheet({ answer: () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })) }));
    open(device());
    await el('edu-backup-save').click();
    await tick();
    assert.equal(el('edu-backup-status').textContent, t('en', 'eduBackupCancelled'));
    assert.equal(dl.clicks.length, 0, 'a cancel never becomes a download');
    closeEduDataPanel();
    const cannot = sheet({ can: false });
    setNav(cannot);
    open(device());
    await el('edu-backup-save').click();
    await tick();
    assert.equal(cannot.calls.length, 0);
    assert.equal(dl.clicks.length, 1);
    assert.match(dl.clicks[0].download, /^flappy-poop-cards-.*\.json$/);
    assert.equal(el('edu-backup-status').textContent, t('en', 'eduBackupDownloaded'));
    closeEduDataPanel();
    const mouse = sheet();
    setNav(mouse, { coarse: false });
    open(device());
    await el('edu-backup-save').click();
    await tick();
    assert.equal(mouse.calls.length, 0, 'a mouse (Mac Safari): a download, not the sheet');
    assert.equal(dl.clicks.length, 2);
  } finally {
    dl.stop();
  }
});

test('Copy as text: the clipboard when there is one; else the text goes into the box', async () => {
  const copied = [];
  setNav({ clipboard: { writeText: (s) => (copied.push(s), Promise.resolve()) } });
  open(device());
  await el('edu-backup-copy').click();
  await tick();
  assert.deepEqual(copied, [BACKUP_TEXT]);
  assert.equal(el('edu-backup-status').textContent, t('en', 'eduBackupCopied'));
  closeEduDataPanel();
  setNav({});
  open(device());
  await el('edu-backup-copy').click();
  await tick();
  assert.equal(el('edu-restore-text').value, BACKUP_TEXT);
  assert.equal(el('edu-backup-status').textContent, t('en', 'eduBackupCopyHere'));
});

test('restore from pasted text and from a file shows what came back; corrupt, newer or huge text says so; the file input resets', async () => {
  const play = device();
  open(play);
  assert.equal(el('edu-restore-paste').disabled, true, 'nothing pasted yet');
  el('edu-restore-text').value = BACKUP_TEXT;
  await el('edu-restore-text').fire('input');
  await el('edu-restore-paste').click();
  assert.equal(el('edu-backup-status').textContent, t('en', 'eduRestoreDone').replace('{added}', '2').replace('{updated}', '0').replace('{badges}', '1'));
  assert.equal(el('edu-restore-text').value, '', 'the box empties after a restore');
  el('edu-restore-text').value = 'garbage';
  await el('edu-restore-text').fire('input');
  await el('edu-restore-paste').click();
  assert.equal(el('edu-backup-status').textContent, t('en', 'eduRestoreBad'));
  el('edu-restore-text').value = JSON.stringify({ ...JSON.parse(BACKUP_TEXT), v: 9 });
  await el('edu-restore-text').fire('input');
  await el('edu-restore-paste').click();
  assert.equal(el('edu-backup-status').textContent, t('en', 'eduRestoreNewer'));
  // From a file.
  const input = el('edu-restore-input');
  assert.equal(input.attrs.type, 'file');
  input.files = [{ name: 'b.json', size: BACKUP_TEXT.length, text: async () => BACKUP_TEXT }];
  input.value = 'C:\\fakepath\\b.json';
  await input.fire('change');
  await tick();
  assert.equal(el('edu-backup-status').textContent.startsWith(t('en', 'eduRestoreDone').split('{added}')[0]), true);
  assert.equal(input.value, '', 'the same file can be picked again');
  let read = false;
  input.files = [{ name: 'big.json', size: 2_000_000, text: async () => ((read = true), '') }];
  await input.fire('change');
  await tick();
  assert.equal(el('edu-backup-status').textContent, t('en', 'eduRestoreTooBig'));
  assert.equal(read, false, 'a file over 1 MB is not read');
});

test('a restore that did not reach storage says it lasts for this visit only; skipped cards are counted', async () => {
  open(device({ restoreEducation: () => ({ ok: true, added: 1, updated: 0, badges: 0, changed: true, saved: false, skipped: 2 }) }));
  el('edu-restore-text').value = BACKUP_TEXT;
  await el('edu-restore-text').fire('input');
  await el('edu-restore-paste').click();
  const line = el('edu-backup-status').textContent;
  assert.ok(line.includes(t('en', 'eduRestoreVisitOnly')), line);
  assert.ok(line.includes(t('en', 'eduRestoreSkipped').replace('{n}', '2')), line);
  closeEduDataPanel();
  open(device({ restoreEducation: () => ({ ok: true, added: 0, updated: 0, badges: 0, changed: false, saved: true, skipped: 0 }) }));
  el('edu-restore-text').value = BACKUP_TEXT;
  await el('edu-restore-text').fire('input');
  await el('edu-restore-paste').click();
  assert.equal(el('edu-backup-status').textContent, t('en', 'eduRestoreNothing'));
});

test('off the home screen (a paused run, the game-over panel) restore is disabled with a line saying to go home; Back up still works', async () => {
  const play = device({ canRestoreEducation: () => false });
  open(play);
  assert.equal(el('edu-restore-file').disabled, true);
  el('edu-restore-text').value = BACKUP_TEXT;
  await el('edu-restore-text').fire('input');
  assert.equal(el('edu-restore-paste').disabled, true);
  assert.equal(el('edu-restore-note').hidden, false);
  assert.equal(el('edu-restore-note').textContent, t('en', 'eduRestoreGoHome'));
  await el('edu-restore-paste').click();
  assert.deepEqual(play.restored, [], 'nothing restored');
  assert.equal(el('edu-backup-save').disabled, false);
  closeEduDataPanel();
  open(device());
  assert.equal(el('edu-restore-note').hidden, true, 'on the home screen: no note');
});

test('the paste box asks the phone not to correct or capitalise; the 💾 strings exist in zh-Hans', () => {
  open(device(), 'zh-Hans');
  const box = el('edu-restore-text');
  assert.deepEqual([box.attrs.autocorrect, box.attrs.autocapitalize, box.attrs.spellcheck], ['off', 'off', 'false']);
  assert.equal(el('edu-backup-title').textContent, t('zh-Hans', 'eduBackupTitle'));
  assert.notEqual(t('zh-Hans', 'eduBackupTitle'), t('en', 'eduBackupTitle'));
});

// Play's side (plan 28, 3.1b).
function playDevice({ state = 'ready', match = null, settings = {} } = {}) {
  const storage = fakeStorage();
  const s = createSettingsStore(storage, 'flappyPoop.settings');
  s.set(settings);
  let dueRefreshed = 0;
  const p = playScene({ state, match, eduStore: createEduStore(storage), eduShare: createEduShareStore(storage, 'flappyPoop.eduShare'), settings: s, refreshEduDue: () => (dueRefreshed += 1) });
  return { p, dueRefreshed: () => dueRefreshed };
}

test("Play: backup text only with cards; restore only on the home screen (not in a match); the backup's order and start level only where this device has the defaults; the 📚 count refreshes", () => {
  const { p, dueRefreshed } = playDevice();
  assert.equal(p.eduHasCards(), false);
  assert.equal(p.eduBackupText(), null);
  assert.equal(p.canRestoreEducation(), true);
  const r = p.restoreEducation(BACKUP_TEXT);
  assert.deepEqual([r.ok, r.added, r.changed, r.skipped], [true, 2, true, 0]);
  assert.equal(p.eduHasCards(), true);
  assert.equal(p.eduCardCount(), 2);
  assert.equal(dueRefreshed(), 1);
  assert.deepEqual([p.settings.load().eduNewOrder, p.settings.load().eduStartLevel], ['mixed', 2], 'defaults here: the backup\'s settings');
  assert.equal(p.settings.load().education, false, 'the 📚 switch is not carried');
  assert.equal(JSON.parse(p.eduBackupText()).kind, 'flappy-poop-education');
  const chosen = playDevice({ settings: { eduNewOrder: 'before', eduStartLevel: 1 } }).p;
  chosen.restoreEducation(BACKUP_TEXT);
  assert.deepEqual([chosen.settings.load().eduNewOrder, chosen.settings.load().eduStartLevel], ['before', 2], 'a choice made here stays');
  for (const [state, match] of [['paused', null], ['dead', null], ['playing', null], ['ready', { id: 'm' }]]) {
    const q = playDevice({ state, match }).p;
    assert.equal(q.canRestoreEducation(), false, `${state}${match ? ' in a match' : ''}`);
    assert.deepEqual(q.restoreEducation(BACKUP_TEXT), { ok: false, error: 'notHome' });
    assert.equal(q.eduHasCards(), false);
  }
  assert.deepEqual(playDevice().p.restoreEducation('nope'), { ok: false, error: 'unrecognised' });
});

test("Clear's warning says the cards go too, only when this device has cards", async () => {
  const warn = async (hasCards) => {
    globalThis.localStorage = fakeStorage();
    const play = { getSaveState: () => ({ id: 'C'.repeat(22), name: 'Clearer', top: [] }), setSaveState() {}, educationAvailable: () => true, eduShareOn: () => false, researchConsent: () => null, eduHasCards: () => hasCards };
    openSavePanel({ game: {}, play, locale: 'en' });
    const root = body.find('save-panel') ?? body.children.find((c) => c.attrs?.role === 'dialog');
    await root.find('save-clear-btn').click();
    const status = root.find('save-status').textContent;
    closeSavePanel();
    return status;
  };
  assert.ok((await warn(true)).includes(t('en', 'saveClearNoteCards')));
  assert.ok(!(await warn(false)).includes(t('en', 'saveClearNoteCards')));
});

// From the step's review (plan 28, 3.1b).
test("restoredSettings: the backup's order and start level only where this device has the defaults; a restore that changed nothing changes no setting", async () => {
  const { restoredSettings } = await import('../src/education.js');
  assert.equal(typeof restoredSettings, 'function');
  assert.deepEqual(restoredSettings({ eduNewOrder: 'after', eduStartLevel: 1 }, { eduNewOrder: 'before', eduStartLevel: 3 }), { eduNewOrder: 'before', eduStartLevel: 3 });
  assert.deepEqual(restoredSettings({ eduNewOrder: 'mixed', eduStartLevel: 1 }, { eduNewOrder: 'before', eduStartLevel: 3 }), { eduStartLevel: 3 });
  assert.deepEqual(restoredSettings({ eduNewOrder: 'after', eduStartLevel: 2 }, { eduNewOrder: 'after', eduStartLevel: 3 }), {});
  const { p } = playDevice();
  p.restoreEducation(BACKUP_TEXT);
  p.settings.set({ eduNewOrder: 'after', eduStartLevel: 1 });
  const again = p.restoreEducation(BACKUP_TEXT);
  assert.equal(again.changed, false);
  assert.deepEqual([p.settings.load().eduNewOrder, p.settings.load().eduStartLevel], ['after', 1], 'nothing new: the settings stay as they are');
});

test('a restore that moved only the streak, the level or the grades says so, not "0 new cards"', async () => {
  open(device({ restoreEducation: () => ({ ok: true, added: 0, updated: 0, badges: 0, changed: true, saved: true, skipped: 0 }) }));
  el('edu-restore-text').value = BACKUP_TEXT;
  await el('edu-restore-text').fire('input');
  await el('edu-restore-paste').click();
  assert.equal(el('edu-backup-status').textContent, t('en', 'eduRestoreProgress'));
});

test('a file still being read when the panel closes is not restored into the next opening', async () => {
  const play = device();
  open(play);
  let release;
  const input = el('edu-restore-input');
  input.files = [{ name: 'slow.json', size: BACKUP_TEXT.length, text: () => new Promise((r) => (release = () => r(BACKUP_TEXT))) }];
  await input.fire('change');
  closeEduDataPanel();
  open(play);
  release();
  await tick();
  assert.deepEqual(play.restored, [], 'the old opening\'s file is dropped');
  assert.equal(el('edu-backup-status').textContent, '');
});

test('typing in the paste box reads no record: only Restore pasted text follows it', async () => {
  let loads = 0;
  const play = device({ eduHasCards: () => (loads += 1, true), eduCardCount: () => (loads += 1, 2) });
  open(play);
  const before = loads;
  el('edu-restore-text').value = 'a';
  await el('edu-restore-text').fire('input');
  assert.equal(loads, before, 'no store read per keystroke');
  assert.equal(el('edu-restore-paste').disabled, false);
  el('edu-restore-text').value = '  ';
  await el('edu-restore-text').fire('input');
  assert.equal(el('edu-restore-paste').disabled, true);
});

// AUD-052 (the Checkpoint 3 audit): Clear's cards note points to 📚 Education data only where it opens
// (the off switch hides it unless the device joined or shares), and zh-Hans joins its notes without a
// space after full-width punctuation.
test("AUD-052: Clear's cards note only where 📚 Education data opens; zh-Hans notes joined without a space", async () => {
  const warn = async ({ locale = 'en', reachable = true, sharing = false } = {}) => {
    globalThis.localStorage = fakeStorage();
    const play = { getSaveState: () => ({ id: 'C'.repeat(22), name: 'Clearer', top: [] }), setSaveState() {}, educationAvailable: () => reachable, eduDataReachable: () => reachable, eduShareOn: () => sharing, researchConsent: () => null, eduHasCards: () => true };
    openSavePanel({ game: {}, play, locale });
    const root = body.find('save-panel') ?? body.children.find((c) => c.attrs?.role === 'dialog');
    await root.find('save-clear-btn').click();
    const status = root.find('save-status').textContent;
    closeSavePanel();
    return status;
  };
  assert.ok(!(await warn({ reachable: false })).includes(t('en', 'saveClearNoteCards')), 'the off switch hides the panel: no pointer to it');
  const zh = await warn({ locale: 'zh-Hans', sharing: true });
  assert.ok(zh.includes(t('zh-Hans', 'saveClearNoteCards')), zh);
  assert.doesNotMatch(zh, /[。：，；！？] /, `no space after full-width punctuation: "${zh}"`);
  assert.match(await warn({ sharing: true }), /\. Your 📚 cards/, 'English keeps its spaces');
});

// AUD-053 (the Checkpoint 3 audit): the panel opened again over itself (an invite link while the sheet is
// up) is the same opening: a second Back up waits, and the first share's result still lands; a restore
// that throws says so.
test('AUD-053: opening the panel over itself keeps a share in progress; a throwing restore shows its error', async () => {
  let finish;
  const nav = sheet({ answer: () => new Promise((r) => (finish = r)) });
  setNav(nav);
  const play = device();
  open(play);
  el('edu-backup-save').listeners.click[0]({});
  open(play); // again, while the sheet is up
  await el('edu-backup-save').click();
  assert.equal(nav.calls.length, 1, 'no second share while the first sheet is open');
  finish();
  await tick();
  assert.equal(el('edu-backup-status').textContent, t('en', 'eduBackupShared'), "the first share's result lands");
  closeEduDataPanel();
  open(device({ restoreEducation: () => { throw new Error('boom'); } }));
  const input = el('edu-restore-input');
  input.files = [{ name: 'b.json', size: 10, text: async () => '{}' }];
  await input.fire('change');
  await tick();
  assert.equal(el('edu-backup-status').textContent, t('en', 'eduRestoreBad'));
});

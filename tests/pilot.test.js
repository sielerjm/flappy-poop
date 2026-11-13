// The education tester pilot end to end in Node (plan 24): Play's real pilot methods, the real
// stores, the real leaderboard.js calls and the real save panel, against db/schema.sql in PGlite
// through the PostgREST stand-in (tests/support/postgrest.js; nothing reaches the network).
// RESEARCH.md is the promise these tests keep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './support/dom.js';
import { playScene, fakeStorage } from './support/scenes.js';
import { freshDb, installPostgrest } from './support/postgrest.js';

const body = installDom();
globalThis.localStorage = fakeStorage(); // save.js's importCode / exportCode default to it

const { createConsentStore, createResearchQueue } = await import('../src/research.js');
const { mergePlayers, createMergeStore } = await import('../src/leaderboard.js');
const { exportCode } = await import('../src/save.js');
const { openSavePanel, closeSavePanel } = await import('../src/ui/savePanel.js');
const { t } = await import('../src/i18n.js');
const { CARDS } = await import('../src/questions.js');

const CODE = 'pilot-code-2026-xyz';

async function pilotDb() {
  const db = await freshDb();
  await db.query('select public.admin_set_invite($1)', [CODE]);
  return db;
}

/**
 * A device: Play.prototype's pilot methods on a bare scene with real stores. Its syncLeaderboard is
 * the real chain's head (Play.syncLeaderboard: queued merges first, then drainResearch); the rest of
 * that chain needs a username and the board.
 */
function device(save, storage = globalThis.localStorage) {
  const reg = new Map();
  const p = playScene({
    save,
    consentStore: createConsentStore(storage),
    researchQueue: createResearchQueue(storage),
    mergeStore: createMergeStore(storage),
    renameStore: { clear() {}, load: () => null },
    careerStore: { clearBase() {} },
    registry: { get: (k) => reg.get(k), set: (k, v) => reg.set(k, v) },
    eduStore: { load: () => ({ cards: {} }), answer: () => {} },
    runIsTest: false, runIsEducation: true, runQuiz: null, levelBreak: false, level: 2, locale: 'en', fieldW: 400, revive: null,
    runId: null, runEvents: 0, boardNameTaken: false,
    refreshTestBadge() {}, takeCoins() {}, refreshLevelBanner() {}, refreshShopButton() {},
    refreshProfile() {}, refreshDailyPrompt() {}, scene: { get: () => null },
    isEduUnlocked: () => true, getHand: () => null, setHand() {},
    syncLeaderboard() {
      const merges = this.mergeStore.load().reduce((chain, pair) => chain.then(() => mergePlayers(pair.keep, pair.merge).then((ok) => { if (ok) this.mergeStore.remove(pair); })), Promise.resolve());
      return (this.lastSync = merges.then(() => this.drainResearch()).catch(() => {}));
    },
  });
  return p;
}

const card = CARDS[0];
const answer = (p) => p.quizAnswer({ card, reason: 'new', order: ['answer', 'w1', 'w2'], chosen: 'w1', rtMs: 1500, interrupted: false, mode: 'bonus', input: 'touch' });
const rows = async (db) => ({
  parts: (await db.query('select player_id, research_id from public.research_participants order by player_id')).rows,
  answers: (await db.query('select research_id from public.research_responses')).rows.length,
});
const ageParticipants = (db) => db.query("update public.research_participants set updated_at = now() - interval '6 seconds'");

/** The real save panel's Load on this device: paste `code`, click Load, wait for it; returns the status line. */
async function loadInPanel(play, code) {
  openSavePanel({ game: {}, play, locale: 'en' });
  const root = body.find('save-panel') ?? body.children.find((c) => c.attrs?.role === 'dialog');
  root.find('save-load').value = code;
  await root.find('save-load-btn').click();
  const status = root.find('save-status').textContent;
  closeSavePanel();
  return status;
}

test('a tester who joined with no username loads a user code, then withdraws: the participant and every answer are deleted (AUD-001)', async () => {
  globalThis.localStorage = fakeStorage();
  const db = await pilotDb();
  const api = installPostgrest(db);
  try {
    const code = await exportCode({ id: 'LAPTOPAAAAAAAAAAAAAAAA', name: 'Tester', top: [], exportedAt: null }, { storage: fakeStorage() });
    const phone = device({ id: null, name: '', top: [], exportedAt: null });
    assert.equal((await phone.joinResearch(CODE, true)).status, 'ok', 'joining makes the id: no username needed (RESEARCH.md)');
    const joinedAs = phone.save.id;
    assert.equal(phone.researchConsent().id, joinedAs, 'the consent keeps the id it joined under');
    answer(phone);
    answer(phone);
    await phone.drainResearch();
    assert.equal((await rows(db)).answers, 2);
    const status = await loadInPanel(phone, code);
    assert.equal(phone.save.id, 'LAPTOPAAAAAAAAAAAAAAAA', "the device took the code's id");
    assert.equal(status, t('en', 'saveMerged').replace('{name}', 'Tester'), 'a tester counts as this device having its own player: the two ids are merged');
    await phone.lastSync;
    assert.deepEqual((await rows(db)).parts.map((r) => r.player_id), ['LAPTOPAAAAAAAAAAAAAAAA'], 'the merge moved the participant to the kept id');
    assert.equal(await phone.leaveResearch(), true);
    assert.deepEqual({ participants: (await rows(db)).parts.length, answers: (await rows(db)).answers }, { participants: 0, answers: 0 }, 'RESEARCH.md: Withdraw deletes the participant record and every answer');
  } finally {
    api.restore();
  }
});

test('answers still queued when a user code is loaded keep going to the participant, and Withdraw still deletes them (AUD-001)', async () => {
  globalThis.localStorage = fakeStorage();
  const db = await pilotDb();
  const api = installPostgrest(db);
  try {
    const code = await exportCode({ id: 'LAPTOPBBBBBBBBBBBBBBBB', name: 'Tester', top: [], exportedAt: null }, { storage: fakeStorage() });
    const phone = device({ id: null, name: '', top: [], exportedAt: null });
    assert.equal((await phone.joinResearch(CODE, true)).status, 'ok');
    answer(phone);
    await phone.drainResearch();
    await ageParticipants(db);
    answer(phone); // still queued when the code is loaded
    await loadInPanel(phone, code);
    await phone.lastSync;
    assert.equal(phone.researchJoined(), true, 'still joined: the queued answer went to the participant');
    assert.equal(phone.researchEnded, false, 'the panel has nothing to say about the pilot ending');
    assert.deepEqual([(await rows(db)).parts.length, (await rows(db)).answers], [1, 2]);
    assert.equal(await phone.leaveResearch(), true);
    assert.deepEqual([(await rows(db)).parts.length, (await rows(db)).answers], [0, 0]);
  } finally {
    api.restore();
  }
});

test('a tester with a username: Load merges, and Withdraw after the merge deletes everything', async () => {
  globalThis.localStorage = fakeStorage();
  const db = await pilotDb();
  const api = installPostgrest(db);
  try {
    const code = await exportCode({ id: 'LAPTOPCCCCCCCCCCCCCCCC', name: 'Tester', top: [], exportedAt: null }, { storage: fakeStorage() });
    const phone = device({ id: 'PHONECCCCCCCCCCCCCCCCC', name: 'Phoney', top: [], exportedAt: null });
    assert.equal((await phone.joinResearch(CODE, true)).status, 'ok');
    answer(phone);
    await phone.drainResearch();
    assert.equal(await loadInPanel(phone, code), t('en', 'saveMerged').replace('{name}', 'Tester'));
    await phone.lastSync;
    assert.equal(phone.mergeStore.load().length, 0, 'the merge reached the server');
    assert.deepEqual((await rows(db)).parts.map((r) => r.player_id), ['LAPTOPCCCCCCCCCCCCCCCC']);
    assert.equal(await phone.leaveResearch(), true);
    assert.deepEqual([(await rows(db)).parts.length, (await rows(db)).answers], [0, 0]);
  } finally {
    api.restore();
  }
});

test('Withdraw that reaches the server before the queued merge still deletes the participant (AUD-001)', async () => {
  globalThis.localStorage = fakeStorage();
  const db = await pilotDb();
  const api = installPostgrest(db);
  try {
    const code = await exportCode({ id: 'LAPTOPDDDDDDDDDDDDDDDD', name: 'Tester', top: [], exportedAt: null }, { storage: fakeStorage() });
    const phone = device({ id: 'PHONEDDDDDDDDDDDDDDDDD', name: 'Phoney', top: [], exportedAt: null });
    assert.equal((await phone.joinResearch(CODE, true)).status, 'ok');
    answer(phone);
    await phone.drainResearch();
    let release;
    const held = new Promise((res) => (release = res));
    const realSync = phone.syncLeaderboard;
    phone.syncLeaderboard = function () {
      return (this.lastSync = held.then(() => realSync.call(this)));
    };
    await loadInPanel(phone, code);
    assert.equal(phone.mergeStore.load().length, 1, 'the merge is queued, not sent yet');
    assert.equal(await phone.leaveResearch(), true, 'Withdraw goes under the id the tester joined with');
    assert.deepEqual([(await rows(db)).parts.length, (await rows(db)).answers], [0, 0], 'deleted at once');
    release();
    await phone.lastSync;
    assert.deepEqual([(await rows(db)).parts.length, (await rows(db)).answers], [0, 0], 'and the merge that lands later brings nothing back');
    assert.equal(phone.researchJoined(), false);
  } finally {
    api.restore();
  }
});

test('after a withdrawal and a new join, a second device of the same player cannot send its older answers into the new participation (AUD-002)', async () => {
  const db = await pilotDb();
  const api = installPostgrest(db);
  try {
    const pid = 'TWINAAAAAAAAAAAAAAAAAA';
    const phone = device({ id: pid, name: 'Twin', top: [], exportedAt: null }, fakeStorage());
    const laptop = device({ id: pid, name: 'Twin', top: [], exportedAt: null }, fakeStorage());
    assert.equal((await phone.joinResearch(CODE, true)).status, 'ok');
    assert.equal((await laptop.joinResearch(CODE, true)).status, 'ok', 'the second device joins the same participation');
    assert.equal(laptop.researchConsent().since, phone.researchConsent().since, 'and holds the same token');
    answer(laptop); // recorded under the first participation
    assert.equal(await phone.leaveResearch(), true, 'withdrawn on the phone');
    answer(laptop); // the laptop has not heard: it still records
    assert.equal((await phone.joinResearch(CODE, true)).status, 'ok', 'joined again on the phone: a new participation');
    const newResearchId = (await rows(db)).parts[0].research_id;
    await laptop.drainResearch();
    assert.equal((await db.query('select count(*)::int as n from public.research_responses where research_id = $1', [newResearchId])).rows[0].n, 0, 'nothing from before the new join is stored under the new research id');
    assert.equal(laptop.researchJoined(), false, 'the laptop is told it is not in this participation and stops recording');
    assert.equal(laptop.researchQueue.size(), 0, 'and its old answers are dropped, not kept for later');
  } finally {
    api.restore();
  }
});

test('two devices of one player that join one after the other both keep sending (AUD-002)', async () => {
  const db = await pilotDb();
  const api = installPostgrest(db);
  try {
    const pid = 'PAIRAAAAAAAAAAAAAAAAAA';
    const phone = device({ id: pid, name: 'Pair', top: [], exportedAt: null }, fakeStorage());
    const laptop = device({ id: pid, name: 'Pair', top: [], exportedAt: null }, fakeStorage());
    assert.equal((await phone.joinResearch(CODE, true)).status, 'ok');
    answer(phone);
    await phone.drainResearch();
    assert.equal((await laptop.joinResearch(CODE, true)).status, 'ok');
    await ageParticipants(db);
    answer(laptop);
    await laptop.drainResearch();
    await ageParticipants(db);
    answer(phone);
    await phone.drainResearch();
    assert.deepEqual([phone.researchJoined(), laptop.researchJoined()], [true, true], 'joining on the laptop did not throw the phone out');
    assert.equal((await rows(db)).answers, 3);
  } finally {
    api.restore();
  }
});

test('joining empties the queue: nothing recorded before this join is sent under it (AUD-005)', async () => {
  const db = await pilotDb();
  const api = installPostgrest(db);
  try {
    const phone = device({ id: 'QUEUEAAAAAAAAAAAAAAAAA', name: 'Q', top: [], exportedAt: null }, fakeStorage());
    assert.equal((await phone.joinResearch(CODE, true)).status, 'ok');
    answer(phone); // queued, not sent
    assert.equal(phone.researchQueue.size(), 1);
    assert.equal((await phone.joinResearch(CODE, true)).status, 'ok', 'joining again (a newer notice, say)');
    assert.equal(phone.researchQueue.size(), 0);
  } finally {
    api.restore();
  }
});

test('a participant who joined again after the owner moved the phase on is still removed by that phase\'s purge (AUD-005)', async () => {
  const db = await pilotDb();
  const api = installPostgrest(db);
  try {
    const phone = device({ id: 'PHASEAAAAAAAAAAAAAAAAA', name: 'P', top: [], exportedAt: null }, fakeStorage());
    assert.equal((await phone.joinResearch(CODE, true)).status, 'ok');
    answer(phone);
    await phone.drainResearch();
    await db.query("update public.education_settings set phase = 'beta'");
    assert.equal((await phone.joinResearch(CODE, true)).status, 'ok');
    assert.equal(phone.researchConsent().phase, 'pilot', 'still the pilot participant');
    await db.query("select public.admin_purge_phase('pilot')");
    assert.deepEqual([(await rows(db)).parts.length, (await rows(db)).answers], [0, 0], "the pilot's purge leaves nothing of it");
  } finally {
    api.restore();
  }
});

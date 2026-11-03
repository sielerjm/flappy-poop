// Save codes (src/save.js): spec rows 1–10 from
// .claude/plans/Flappy Poop — Save Code Spec.md plus helper coverage.
// Top entries are { score, toilet }; topScores() gives just the numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_VERSION,
  SAVE_KEY,
  SCHEMA,
  PARSERS,
  MAX_TOP,
  TOILET_EMOJI,
  loadLocal,
  saveLocal,
  ensureId,
  validateName,
  recordScore,
  isNewTop,
  merge,
  summaryLine,
  profileLine,
  topScores,
  formatScore,
  extractCode,
  buildCode,
  exportCode,
  importCode,
  newId,
  b64urlEncode,
  b64urlDecode,
} from '../src/save.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _map: m };
}
const boom = {
  getItem() {
    throw new Error('denied');
  },
  setItem() {
    throw new Error('denied');
  },
};

const NOW = 1762200000;
const plain = (scores) => scores.map((score) => ({ score, toilet: false }));
const alice = () => ({ id: newId(), name: 'Alice', top: [41, 37, 30], exportedAt: null });

test('1. export then import the same code gives the identical state back', async () => {
  const storage = fakeStorage();
  const state = alice();
  const code = await exportCode(state, { storage, now: () => NOW });
  assert.match(code, /^fp1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(code.split('.').length, 3);
  const res = await importCode(code, { storage });
  assert.equal(res.ok, true);
  assert.deepEqual(res.state, { id: state.id, name: 'Alice', top: plain([41, 37, 30]), exportedAt: NOW });
  assert.deepEqual(loadLocal(storage), res.state);
});

test('2. flipping one payload character is rejected as damaged', async () => {
  const code = await exportCode(alice(), { storage: fakeStorage(), now: () => NOW });
  const [prefix, body, sig] = code.split('.');
  const i = 5;
  const flipped = body.slice(0, i) + (body[i] === 'A' ? 'B' : 'A') + body.slice(i + 1);
  assert.notEqual(flipped, body);
  const res = await importCode(`${prefix}.${flipped}.${sig}`, { storage: fakeStorage() });
  assert.deepEqual(res, { ok: false, error: 'damaged' });
});

test('3. relabelling fp1. as fp2. is rejected: unrecognised without a v2 parser, damaged with one', async () => {
  const code = await exportCode(alice(), { storage: fakeStorage(), now: () => NOW });
  const relabelled = code.replace(/^fp1\./, 'fp2.');
  assert.deepEqual(await importCode(relabelled, { storage: fakeStorage() }), { ok: false, error: 'unrecognised' });
  const parsers = { ...PARSERS, 2: PARSERS[1] };
  assert.deepEqual(await importCode(relabelled, { storage: fakeStorage(), parsers }), { ok: false, error: 'damaged' });
});

test('4. a v1 code still imports after CURRENT_VERSION is bumped to 2; re-export starts with fp2.', async () => {
  const storage = fakeStorage();
  const v1 = await exportCode(alice(), { storage: fakeStorage(), now: () => NOW });
  const parseV2 = (json) => ({ ...PARSERS[1](json), unlocks: Array.isArray(json.u) ? json.u : [] });
  const parsers = { ...PARSERS, 2: parseV2 };
  const res = await importCode(v1, { storage, parsers });
  assert.equal(res.ok, true);
  assert.deepEqual(topScores(res.state), [41, 37, 30]);
  const v2 = await exportCode(res.state, { version: 2, storage, now: () => NOW + 1 });
  assert.match(v2, /^fp2\./);
  const again = await importCode(v2, { storage: fakeStorage(), parsers });
  assert.equal(again.ok, true);
  assert.deepEqual(topScores(again.state), [41, 37, 30]);
  assert.equal(again.state.exportedAt, NOW + 1);
  assert.equal(CURRENT_VERSION, 1);
});

// The spec table (written for a top 3) expected [41, 37, 30]; the list now keeps six.
test('5. local [41, 30] merged with pasted [37, 30, 12] unions the scores, best first', async () => {
  const local = { id: newId(), name: 'A', top: [41, 30], exportedAt: null };
  const incoming = { id: newId(), name: 'B', top: [37, 30, 12], exportedAt: NOW };
  assert.deepEqual(topScores(merge(local, incoming)), [41, 37, 30, 12]);
  const storage = fakeStorage();
  saveLocal(local, storage);
  const code = await exportCode(incoming, { storage: fakeStorage(), now: () => NOW });
  const res = await importCode(code, { storage });
  assert.equal(res.ok, true);
  assert.deepEqual(topScores(res.state), [41, 37, 30, 12]);
});

test('6. the pasted name and id win over the local ones', async () => {
  const local = { id: 'local-id', name: 'A', top: [], exportedAt: null };
  const incoming = { id: newId(), name: 'B', top: [], exportedAt: NOW };
  const merged = merge(local, incoming);
  assert.equal(merged.name, 'B');
  assert.equal(merged.id, incoming.id);
  const storage = fakeStorage();
  saveLocal(local, storage);
  const res = await importCode(await exportCode(incoming, { storage: fakeStorage(), now: () => NOW }), { storage });
  assert.equal(res.state.name, 'B');
  assert.equal(res.state.id, incoming.id);
});

test('7. a code wrapped in a URL fragment, quotes, or whitespace is extracted and accepted', async () => {
  const code = await exportCode(alice(), { storage: fakeStorage(), now: () => NOW });
  for (const wrapped of [`https://example.test/#code=${code}`, `"${code}"`, `  \n${code}\n`, `'${code}'`]) {
    assert.equal(extractCode(wrapped), code);
    const res = await importCode(wrapped, { storage: fakeStorage() });
    assert.equal(res.ok, true, wrapped);
    assert.equal(res.state.name, 'Alice');
  }
  assert.equal(extractCode('no code here'), null);
  assert.equal(extractCode(undefined), null);
});

test('8. a 13-character name is rejected at export and at import', async () => {
  const long = 'A'.repeat(13);
  assert.equal(validateName(long).ok, false);
  assert.equal(validateName('').ok, false);
  assert.equal(validateName('   ').ok, false);
  assert.equal(validateName('A'.repeat(12)).ok, true);
  assert.deepEqual(validateName('  Bob  '), { ok: true, name: 'Bob' });
  await assert.rejects(exportCode({ ...alice(), name: long }, { storage: fakeStorage() }), /name/);
  await assert.rejects(exportCode({ ...alice(), name: '' }, { storage: fakeStorage() }), /name/);
  const forged = await buildCode(1, { i: newId(), n: long, s: [1], t: NOW });
  assert.deepEqual(await importCode(forged, { storage: fakeStorage() }), { ok: false, error: 'unrecognised' });
});

test('9. an empty score list is accepted and the summary line shows the name only', async () => {
  const code = await buildCode(1, { i: newId(), n: 'Solo', s: [], t: NOW });
  const res = await importCode(code, { storage: fakeStorage() });
  assert.equal(res.ok, true);
  assert.deepEqual(res.state.top, []);
  assert.equal(summaryLine(res.state), 'Solo');
  assert.equal(summaryLine({ name: 'Alice', top: [41, 37, 30] }), 'Alice · 41 · 37 · 30');
  assert.equal(summaryLine({ name: '', top: [5] }), '');
  assert.equal(summaryLine(null), '');
});

test('10. a storage that throws never propagates: empty state, silent save, import still ok', async () => {
  assert.deepEqual(loadLocal(boom), { id: null, name: '', top: [], exportedAt: null });
  assert.deepEqual(loadLocal(null), { id: null, name: '', top: [], exportedAt: null });
  assert.doesNotThrow(() => saveLocal(alice(), boom));
  const code = await exportCode(alice(), { storage: boom, now: () => NOW });
  const res = await importCode(code, { storage: boom });
  assert.equal(res.ok, true);
  assert.equal(res.state.name, 'Alice');
});

test('recordScore keeps the best six, deduplicates, ignores 0, and returns a new object', () => {
  assert.equal(MAX_TOP, 6);
  const s0 = { id: null, name: '', top: [], exportedAt: null };
  const s1 = recordScore(s0, 5);
  assert.deepEqual(s1.top, plain([5]));
  assert.deepEqual(s0.top, []);
  const s2 = recordScore(recordScore(recordScore(s1, 9), 7), 3);
  assert.deepEqual(topScores(s2), [9, 7, 5, 3]);
  assert.deepEqual(topScores(recordScore(s2, 7)), [9, 7, 5, 3]);
  assert.deepEqual(topScores(recordScore(s2, 8)), [9, 8, 7, 5, 3]);
  assert.deepEqual(topScores(recordScore(s2, 0)), [9, 7, 5, 3]);
  assert.deepEqual(topScores(recordScore(s2, -2)), [9, 7, 5, 3]);
  assert.deepEqual(topScores(recordScore(s2, 2.5)), [9, 7, 5, 3]);
  const full = { ...s0, top: [9, 8, 7, 6, 5, 4] };
  assert.deepEqual(topScores(recordScore(full, 3)), [9, 8, 7, 6, 5, 4]);
  assert.deepEqual(topScores(recordScore(full, 10)), [10, 9, 8, 7, 6, 5]);
});

test('toilet runs keep their flag through recordScore, dedupe, and merge', () => {
  const s = recordScore({ top: [] }, 12, { toilet: true });
  assert.deepEqual(s.top, [{ score: 12, toilet: true }]);
  // Same score again off the toilet: the first entry wins.
  assert.deepEqual(recordScore(s, 12).top, [{ score: 12, toilet: true }]);
  const s2 = recordScore(s, 20);
  assert.deepEqual(s2.top, [{ score: 20, toilet: false }, { score: 12, toilet: true }]);
  // Merge: local entry wins a tie, incoming flags survive otherwise.
  const merged = merge({ name: 'A', top: [{ score: 20, toilet: false }] }, { name: 'B', top: [{ score: 20, toilet: true }, { score: 8, toilet: true }] });
  assert.deepEqual(merged.top, [{ score: 20, toilet: false }, { score: 8, toilet: true }]);
});

test('isNewTop is true only for a strictly new entry that makes the list', () => {
  const s = { id: null, name: 'x', top: [9, 8, 7, 6, 5, 4], exportedAt: null };
  assert.equal(isNewTop(s, 10), true);
  assert.equal(isNewTop(s, 7), false);
  assert.equal(isNewTop(s, 3), false);
  assert.equal(isNewTop(s, 0), false);
  assert.equal(isNewTop({ top: [] }, 1), true);
  assert.equal(isNewTop({ top: [9, 7, 5] }, 1), true);
});

test('formatScore, profileLine, and summaryLine mark toilet scores with the emoji', () => {
  assert.equal(formatScore(41), '41');
  assert.equal(formatScore({ score: 41, toilet: false }), '41');
  assert.equal(formatScore({ score: 41, toilet: true }), `${TOILET_EMOJI} 41`);
  assert.equal(formatScore(null), '');
  assert.equal(profileLine({ name: 'Bob', top: [{ score: 41, toilet: true }, 37] }), `Bob · ${TOILET_EMOJI} 41`);
  assert.equal(profileLine({ name: 'Bob', top: [41, 37, 30, 12, 9, 5] }), 'Bob · 41');
  assert.equal(profileLine({ name: 'Bob', top: [] }), 'Bob');
  assert.equal(profileLine({ name: '', top: [5] }), '');
  assert.equal(profileLine(null), '');
  assert.equal(summaryLine({ name: 'Bob', top: [{ score: 41, toilet: true }, 37] }), `Bob · ${TOILET_EMOJI} 41 · 37`);
});

test('toilet flags travel in the code as p; missing p reads as all false; bad p is unrecognised', async () => {
  const state = { id: newId(), name: 'Loo', top: [{ score: 41, toilet: true }, { score: 37, toilet: false }, { score: 30, toilet: true }], exportedAt: null };
  const code = await exportCode(state, { storage: fakeStorage(), now: () => NOW });
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(code.split('.')[1])));
  assert.deepEqual(Object.keys(payload), ['i', 'n', 's', 'p', 't']);
  assert.deepEqual(payload.s, [41, 37, 30]);
  assert.deepEqual(payload.p, [1, 0, 1]);
  const res = await importCode(code, { storage: fakeStorage() });
  assert.equal(res.ok, true);
  assert.deepEqual(res.state.top, state.top);

  const noP = await buildCode(1, { i: newId(), n: 'Old', s: [41, 37], t: NOW });
  const old = await importCode(noP, { storage: fakeStorage() });
  assert.equal(old.ok, true);
  assert.deepEqual(old.state.top, plain([41, 37]));

  for (const p of [[1], [1, 2], 'x', [true, false]]) {
    const bad = await buildCode(1, { i: newId(), n: 'Bad', s: [41, 37], p, t: NOW });
    assert.deepEqual(await importCode(bad, { storage: fakeStorage() }), { ok: false, error: 'unrecognised' }, JSON.stringify(p));
  }
});

test('local storage writes schema 2, reads schema 1 (bare numbers) and 2, ignores other schemas or junk', () => {
  const storage = fakeStorage();
  const saved = saveLocal({ id: 'abc', name: ' Zoe ', top: [3, { score: 9, toilet: true }, 9, 0], exportedAt: NOW }, storage);
  assert.deepEqual(saved, { id: 'abc', name: 'Zoe', top: [{ score: 9, toilet: true }, { score: 3, toilet: false }], exportedAt: NOW });
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).schema, SCHEMA);
  assert.equal(SCHEMA, 2);
  assert.deepEqual(loadLocal(storage), saved);
  storage.setItem(SAVE_KEY, JSON.stringify({ schema: 1, id: 'abc', name: 'Old', top: [41, 30], exportedAt: null }));
  assert.deepEqual(loadLocal(storage), { id: 'abc', name: 'Old', top: plain([41, 30]), exportedAt: null });
  storage.setItem(SAVE_KEY, 'banana');
  assert.deepEqual(loadLocal(storage).top, []);
  storage.setItem(SAVE_KEY, JSON.stringify({ schema: 3, name: 'Zoe', top: [1] }));
  assert.equal(loadLocal(storage).name, '');
});

test('ensureId generates once, persists, and never regenerates', () => {
  const storage = fakeStorage();
  const a = ensureId({ name: 'A', top: [] }, storage);
  assert.equal(typeof a.id, 'string');
  assert.equal(b64urlDecode(a.id).length, 16);
  assert.equal(loadLocal(storage).id, a.id);
  assert.equal(ensureId(a, storage).id, a.id);
});

test('a UTF-8 name round-trips through the code', async () => {
  const code = await exportCode({ id: newId(), name: '便便', top: [2], exportedAt: null }, { storage: fakeStorage(), now: () => NOW });
  assert.equal(code.includes('\n'), false);
  const res = await importCode(code, { storage: fakeStorage() });
  assert.equal(res.ok, true);
  assert.equal(res.state.name, '便便');
});

test('six scores round-trip through a code; a seventh is dropped locally and rejected on the wire', async () => {
  const six = [60, 50, 40, 30, 20, 10];
  const code = await exportCode({ id: newId(), name: 'Six', top: six, exportedAt: null }, { storage: fakeStorage(), now: () => NOW });
  const res = await importCode(code, { storage: fakeStorage() });
  assert.equal(res.ok, true);
  assert.deepEqual(topScores(res.state), six);
  assert.deepEqual(topScores(recordScore(res.state, 5)), six);
});

test('malformed codes are unrecognised, a bad signature is damaged', async () => {
  const storage = fakeStorage();
  assert.deepEqual(await importCode('', { storage }), { ok: false, error: 'unrecognised' });
  assert.deepEqual(await importCode('fp1.abc', { storage }), { ok: false, error: 'unrecognised' });
  assert.deepEqual(await importCode('fp9.abc.def', { storage }), { ok: false, error: 'unrecognised' });
  assert.deepEqual(await importCode('fp1.abc.def', { storage }), { ok: false, error: 'damaged' });
  const notJson = await buildCode(1, 'just a string');
  assert.deepEqual(await importCode(notJson, { storage }), { ok: false, error: 'unrecognised' });
  const badId = await buildCode(1, { i: 'short', n: 'A', s: [], t: NOW });
  assert.deepEqual(await importCode(badId, { storage }), { ok: false, error: 'unrecognised' });
  const sevenScores = await buildCode(1, { i: newId(), n: 'A', s: [1, 2, 3, 4, 5, 6, 7], t: NOW });
  assert.deepEqual(await importCode(sevenScores, { storage }), { ok: false, error: 'unrecognised' });
  const negative = await buildCode(1, { i: newId(), n: 'A', s: [-1], t: NOW });
  assert.deepEqual(await importCode(negative, { storage }), { ok: false, error: 'unrecognised' });
  assert.equal(storage.getItem(SAVE_KEY), null, 'nothing written on failure');
});

test('base64url helpers round-trip bytes without padding or +/', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  const enc = b64urlEncode(bytes);
  assert.match(enc, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual([...b64urlDecode(enc)], [...bytes]);
  assert.throws(() => b64urlDecode('a+b/c='));
});

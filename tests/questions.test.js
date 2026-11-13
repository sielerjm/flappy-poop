// The education question bank (plan 21): src/questions.js, its audits
// (src/questionAudits.js) and the audit tool (tools/audit_questions.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../src/config.js';
import { CARDS, DECKS, REFERENCES } from '../src/questions.js';
import { QUESTION_AUDITS, auditState, cardHash } from '../src/questionAudits.js';
import { auditCounts, formatAudits, listLines, localDay, markAudits, parseArgs, replaceBlock, reportMarkdown, unmarkAudits } from '../tools/audit_questions.mjs';

// Card text limits: the quiz card (src/scenes/Quiz.js) shows the question and three option boxes at
// once on a phone. These keep new cards short; the smoke's education-quiz section lays every card out
// in the real card (answered wrong, explanation and source showing) and checks it fits.
const LIMITS = { q: 120, option: 72, explainChars: 180, explainWords: 30 };
// A level break offers the cleared segment's new cards first: every level deck keeps at least this many live.
const MIN_LIVE_PER_LEVEL_DECK = 5;
const live = CARDS.filter((c) => !c.retired);
const words = (s) => s.trim().split(/\s+/).length;

test('decks: one per level, in level order, then general', () => {
  assert.deepEqual(DECKS, [...LEVELS.map((l) => l.key), 'general']);
});

test('every card has a permanent-looking id, unique, and a known deck', () => {
  const ids = CARDS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate card id');
  for (const c of CARDS) {
    assert.match(c.id, /^[A-Z]{2}-\d{2}$/, `${c.id}: ids look like ST-01`);
    assert.ok(DECKS.includes(c.deck), `${c.id}: unknown deck ${c.deck}`);
  }
});

test('every card has a question, one answer and two wrong answers, all different', () => {
  for (const c of CARDS) {
    for (const f of ['q', 'answer', 'explain']) assert.ok(typeof c[f] === 'string' && c[f].trim() === c[f] && c[f].length > 0, `${c.id}: ${f}`);
    assert.ok(Array.isArray(c.wrong) && c.wrong.length === 2, `${c.id}: two wrong answers`);
    const options = [c.answer, ...c.wrong].map((s) => s.toLowerCase());
    assert.equal(new Set(options).size, 3, `${c.id}: the three options must differ`);
    for (const w of c.wrong) assert.ok(typeof w === 'string' && w.trim() === w && w.length > 0, `${c.id}: wrong answer`);
  }
});

test('card text fits the quiz panel: question, options and explanation under their limits', () => {
  for (const c of CARDS) {
    assert.ok(c.q.length <= LIMITS.q, `${c.id}: question ${c.q.length} chars > ${LIMITS.q}`);
    for (const o of [c.answer, ...c.wrong]) assert.ok(o.length <= LIMITS.option, `${c.id}: option "${o}" ${o.length} chars > ${LIMITS.option}`);
    assert.ok(c.explain.length <= LIMITS.explainChars, `${c.id}: explanation ${c.explain.length} chars > ${LIMITS.explainChars}`);
    assert.ok(words(c.explain) <= LIMITS.explainWords, `${c.id}: explanation ${words(c.explain)} words > ${LIMITS.explainWords}`);
  }
});

test('a Chinese version, where there is one, has every field', (t) => {
  const translated = CARDS.filter((x) => x.zh);
  // Say so rather than pass on an empty loop: no card has a Chinese version yet (plan 24, AUD-024).
  if (translated.length === 0) return t.skip('no card has a Chinese version yet');
  for (const c of translated) {
    for (const f of ['q', 'answer', 'explain']) assert.ok(typeof c.zh[f] === 'string' && c.zh[f].length > 0, `${c.id}: zh.${f}`);
    assert.ok(Array.isArray(c.zh.wrong) && c.zh.wrong.length === 2, `${c.id}: zh.wrong`);
  }
});

test('every card cites a reference that exists, and every reference is cited', () => {
  const nums = Object.keys(REFERENCES).map(Number);
  assert.deepEqual(nums, nums.map((_, i) => i + 1), 'references are numbered 1..N');
  for (const c of CARDS) {
    assert.ok(Array.isArray(c.refs) && c.refs.length > 0, `${c.id}: no refs`);
    for (const r of c.refs) assert.ok(r in REFERENCES, `${c.id}: no reference ${r}`);
  }
  const cited = new Set(CARDS.flatMap((c) => c.refs));
  assert.deepEqual(nums.filter((n) => !cited.has(n)), [], 'references no card cites');
});

test('every level deck keeps enough live cards for a level break; the general deck is not empty', () => {
  for (const deck of DECKS) {
    const n = live.filter((c) => c.deck === deck).length;
    if (deck === 'general') assert.ok(n > 0, 'the general deck is empty');
    else assert.ok(n >= MIN_LIVE_PER_LEVEL_DECK, `${deck}: ${n} live cards < ${MIN_LIVE_PER_LEVEL_DECK}`);
  }
});

test('no stale audit: a card edited since its audit must be audited again or unmarked', () => {
  const stale = CARDS.filter((c) => auditState(c) === 'stale').map((c) => `${c.id} (audited by ${QUESTION_AUDITS[c.id].by} on ${QUESTION_AUDITS[c.id].on})`);
  assert.deepEqual(stale, [], `cards changed since their audit; re-audit (node tools/audit_questions.mjs mark <ID> --by="Name") or unmark:\n  ${stale.join('\n  ')}`);
});

test('every audit record names a card and has who, when and the hash', () => {
  const ids = new Set(CARDS.map((c) => c.id));
  for (const [id, r] of Object.entries(QUESTION_AUDITS)) {
    assert.ok(ids.has(id), `audit for unknown card ${id}`);
    assert.ok(typeof r.by === 'string' && r.by.trim().length > 0, `${id}: by`);
    assert.match(r.on, /^\d{4}-\d{2}-\d{2}$/, `${id}: on`);
    assert.match(r.hash, /^[0-9a-f]{8}$/, `${id}: hash`);
  }
});

const FIXTURE = { id: 'ZZ-01', deck: 'general', q: 'Q?', answer: 'A', wrong: ['B', 'C'], explain: 'Because.', refs: [1] };

test('cardHash: 8 hex digits; changes with the facts, not with the deck, retirement or a translation', () => {
  const h = cardHash(FIXTURE);
  assert.match(h, /^[0-9a-f]{8}$/);
  assert.equal(cardHash({ ...FIXTURE }), h, 'stable');
  for (const edit of [{ q: 'Q!' }, { answer: 'A.' }, { wrong: ['C', 'B'] }, { explain: 'Because!' }, { refs: [2] }]) {
    assert.notEqual(cardHash({ ...FIXTURE, ...edit }), h, `an edit to ${Object.keys(edit)[0]} changes the hash`);
  }
  for (const keep of [{ deck: 'stomach' }, { retired: true }, { zh: { q: '问?', answer: '甲', wrong: ['乙', '丙'], explain: '因为。' } }]) {
    assert.equal(cardHash({ ...FIXTURE, ...keep }), h, `${Object.keys(keep)[0]} keeps the hash`);
  }
});

test('auditState: unaudited without a record, audited while the hash matches, stale after an edit', () => {
  assert.equal(auditState(FIXTURE, {}), 'unaudited');
  const audits = { 'ZZ-01': { by: 'Tester', on: '2026-11-12', hash: cardHash(FIXTURE) } };
  assert.equal(auditState(FIXTURE, audits), 'audited');
  assert.equal(auditState({ ...FIXTURE, explain: 'Because, really.' }, audits), 'stale');
});

test('audit tool parseArgs: commands, ids upper-cased, --by / --note / --on / --out; bad input throws', () => {
  assert.deepEqual(parseArgs([]), { command: 'list', ids: [], by: null, note: null, on: null, out: null });
  const m = parseArgs(['mark', 'st-01', 'ST-02', '--by=Michael Sieler', '--note=checked ref 1', '--on=2026-11-20']);
  assert.deepEqual(m, { command: 'mark', ids: ['ST-01', 'ST-02'], by: 'Michael Sieler', note: 'checked ref 1', on: '2026-11-20', out: null });
  assert.equal(parseArgs(['report', '--out=sheet.md']).out, 'sheet.md');
  assert.throws(() => parseArgs(['delete']), /unknown command delete/);
  assert.throws(() => parseArgs(['mark', 'ST-01']), /--by=/);
  assert.throws(() => parseArgs(['mark', '--by=X']), /name at least one card/);
  assert.throws(() => parseArgs(['mark', 'XX-99', '--by=X']), /no card XX-99/);
  assert.throws(() => parseArgs(['list', '--fast']), /unknown option --fast/);
  assert.throws(() => parseArgs(['mark', 'ST-01', '--by=X', '--on=12 Nov']), /YYYY-MM-DD/);
});

test('audit tool: mark → format → splice → import reads back as audited; unmark drops it', async () => {
  const cards = [FIXTURE, { ...FIXTURE, id: 'ZZ-02', q: "It's?" }];
  const marked = markAudits({}, ['ZZ-02', 'ZZ-01'], { by: "O'Brien", on: '2026-11-20', note: 'ok' }, cards);
  const block = formatAudits(marked, cards);
  assert.ok(block.indexOf("'ZZ-01'") < block.indexOf("'ZZ-02'"), 'records in bank order');
  const src = readFileSync(new URL('../src/questionAudits.js', import.meta.url), 'utf8');
  const spliced = replaceBlock(src, block);
  assert.ok(spliced.includes(block) && spliced.includes('export function cardHash'), 'the block is replaced, the helpers kept');
  const mod = await import(`data:text/javascript,${encodeURIComponent(block)}`);
  for (const c of cards) assert.equal(auditState(c, mod.QUESTION_AUDITS), 'audited', c.id);
  assert.equal(mod.QUESTION_AUDITS['ZZ-01'].by, "O'Brien");
  assert.deepEqual(Object.keys(unmarkAudits(marked, ['ZZ-01'])), ['ZZ-02']);
  assert.match(formatAudits({}, cards), /export const QUESTION_AUDITS = \{\};/);
  assert.throws(() => replaceBlock('no markers here', block), /no \/\/ BEGIN QUESTION_AUDITS/);
});

test('audit tool: list and report cover every card and count each state', () => {
  const cards = [FIXTURE, { ...FIXTURE, id: 'ZZ-02' }, { ...FIXTURE, id: 'ZZ-03', retired: true }, { ...FIXTURE, id: 'ZZ-04', q: 'Edited?' }];
  const audits = { 'ZZ-01': { by: 'A', on: '2026-11-20', hash: cardHash(FIXTURE) }, 'ZZ-04': { by: 'B', on: '2026-11-21', hash: cardHash(FIXTURE) } };
  assert.deepEqual(auditCounts(audits, cards), { audited: 1, stale: 1, unaudited: 1, retired: 1 });
  const lines = listLines(audits, cards);
  assert.match(lines[0], /^ZZ-04 .*stale.*audited by B on 2026-11-21/, 'stale cards first');
  assert.match(lines[1], /^ZZ-02 .*unaudited/);
  assert.match(lines.at(-1), /4 cards: 1 audited, 1 stale, 1 unaudited, 1 retired/);
  const md = reportMarkdown(audits, cards, { 1: 'A source.' }, ['general'], '2026-11-22');
  for (const c of cards) assert.ok(md.includes(`| ${c.id} |`), `${c.id} in the report`);
  assert.match(md, /Cited by: ZZ-01, ZZ-02, ZZ-03, ZZ-04\./);
  assert.match(reportMarkdown().split('\n')[2], new RegExp(`${CARDS.length} cards: .* unaudited`));
  assert.match(localDay(new Date(2026, 10, 2)), /^2026-11-02$/);
});
